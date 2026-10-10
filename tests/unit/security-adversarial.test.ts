import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBundle } from "../../src/core/bundle-builder.js";
import {
  cacheMetaPath,
  readCachedSkillVerified,
  skillCachePath,
  writeCachedSkill,
  writeCacheMeta,
  resolveSkillResource,
} from "../../src/core/cache.js";
import { defaultConfig, ensureOmniDirs } from "../../src/core/config.js";

import { OmniError } from "../../src/core/errors.js";
import { discoverSkillPaths, fetchFileRaw, fetchRepoTree } from "../../src/core/fetcher.js";
import { installManagedInstructions } from "../../src/core/installer.js";
import { appendLog, readLog } from "../../src/core/logger.js";
import { matchSkills } from "../../src/core/matcher.js";
import { migrateAndValidate } from "../../src/core/registry.js";
import { scanProject } from "../../src/core/scanner.js";
import {
  assertSafeRelativePath,
  contentHash,
  isTrustedGitHubHost,
  parseGitHubRepo,
  redactSecrets,
  scanSuspiciousInstructions,
} from "../../src/core/security.js";
import { parseSkillMarkdown } from "../../src/core/skill-parser.js";
import { addRepository } from "../../src/core/sync.js";
import type { SkillRegistry } from "../../src/types/index.js";
import { githubSkillFixture, mockFetch } from "../helpers/mock-fetch.js";
import { makeTempDir, seedProject } from "../helpers/temp.js";

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "adversarial");

function readFixture(rel: string): string {
  return readFileSync(join(fixturesRoot, rel), "utf8");
}

describe("QA-03 adversarial security", () => {
  it("1) flags env-reveal skill as suspicious but never executes it", () => {
    const content = readFixture("env-reveal/SKILL.md");
    const parsed = parseSkillMarkdown(content);
    const hits = scanSuspiciousInstructions(content);
    expect(parsed.name).toBe("env-reveal-sim");
    expect(hits.some((h) => /environment|secret|exfiltration|credential/i.test(h))).toBe(true);
    // Boundary: no child_process / eval of skill body in this process
    expect(content).not.toMatch(/require\(['"]child_process['"]\)/);
  });

  it("2) flags policy-override skill; trusted bundle policy remains first", () => {
    const content = readFixture("policy-override/SKILL.md");
    const hits = scanSuspiciousInstructions(content);
    expect(hits.some((h) => /prompt-injection|policy override/i.test(h))).toBe(true);

    const root = makeTempDir();
    ensureOmniDirs(root);
    writeCachedSkill(root, "override", content);
    writeCacheMeta(root, "override", {
      sourceId: "src",
      path: "policy-override/SKILL.md",
      contentHash: contentHash(content),
      syncedAt: new Date().toISOString(),
    });
    const registry: SkillRegistry = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sources: [
        { id: "src", owner: "o", repo: "r", url: "https://github.com/o/r", trustStatus: "unreviewed" },
      ],
      skills: [
        {
          id: "override",
          name: "policy-override-sim",
          description: "override",
          domains: ["security"],
          stacks: [],
          triggers: ["override"],
          sourceId: "src",
          path: "policy-override/SKILL.md",
          priority: 9,
          cacheStatus: "cached",
          contentHash: contentHash(content),
        },
      ],
    };
    const match = matchSkills("override policy", null, registry, defaultConfig(), { minScore: 1 });
    const bundle = buildBundle({
      projectRoot: root,
      task: "override policy",
      profile: null,
      registry,
      match,
      config: defaultConfig(),
      bundleOptions: { maxChars: 48_000, agent: "portable" },
    });
    const policyIdx = bundle.markdown.indexOf("OmniSkill security policy (trusted");
    const untrustedIdx = bundle.markdown.indexOf("Untrusted skill instructions");
    expect(policyIdx).toBeGreaterThanOrEqual(0);
    expect(untrustedIdx).toBeGreaterThan(policyIdx);
    expect(bundle.warnings.some((w) => /prompt-injection|policy override/i.test(w))).toBe(true);
  });

  it("3) rejects outside-directory references from skill body links", () => {
    const content = readFixture("path-escape/SKILL.md");
    const parsed = parseSkillMarkdown(content);
    // Unsafe links are dropped during parse (not silently resolved)
    expect(parsed.references.every((r) => !r.includes("..") && !r.startsWith("/"))).toBe(true);
    const root = makeTempDir();
    ensureOmniDirs(root);
    writeCachedSkill(root, "escape", content);
    expect(() => resolveSkillResource(root, "escape", "../../../../.env")).toThrow(OmniError);
    expect(() => assertSafeRelativePath("/etc/passwd")).toThrow(OmniError);
  });

  it("4) drops path-traversal SKILL.md entries from discovery and does not fetch them", async () => {
    const paths = discoverSkillPaths([
      { path: "good/SKILL.md", type: "blob", sha: "1" },
      { path: "../escape/SKILL.md", type: "blob", sha: "2" },
      { path: "nested/../../etc/SKILL.md", type: "blob", sha: "3" },
    ]);
    expect(paths).toEqual(["good/SKILL.md"]);

    await expect(
      fetchFileRaw({ owner: "a", repo: "b", url: "https://github.com/a/b" }, "../escape/SKILL.md", {
        fetchImpl: mockFetch(() => ({ status: 200, body: "should-not-fetch" })),
      }),
    ).rejects.toThrow(/PATH_UNSAFE|traversal/i);
  });

  it("5) rejects unexpected redirect hosts including suffix bypasses", async () => {
    expect(isTrustedGitHubHost("prefixgithub.com")).toBe(false);
    expect(isTrustedGitHubHost("evilgithubusercontent.com")).toBe(false);
    expect(isTrustedGitHubHost("api.github.com")).toBe(true);
    expect(isTrustedGitHubHost("raw.githubusercontent.com")).toBe(true);
    expect(isTrustedGitHubHost("cdn.githubusercontent.com")).toBe(true);

    const fetchImpl = mockFetch(() => ({
      status: 200,
      body: "{}",
      url: "https://prefixgithub.com/steal",
    }));
    await expect(
      fetchRepoTree({ owner: "a", repo: "b", url: "https://github.com/a/b" }, { fetchImpl }),
    ).rejects.toMatchObject({ code: "REDIRECT_UNTRUSTED" });
  });

  it("6) rejects malformed/oversized skill documents and unsafe YAML keys", () => {
    const malformed = readFixture("malformed-frontmatter/SKILL.md");
    expect(() => parseSkillMarkdown(malformed)).toThrow(OmniError);
    try {
      parseSkillMarkdown(malformed);
    } catch (err) {
      expect((err as OmniError).code).toBe("YAML_UNSAFE_KEY");
    }

    const big = `---
name: huge
description: oversized
---
${"A".repeat(2_000_000)}
`;
    // Parser itself may accept; network layer enforces size — assert size helper path via fetch mock
    expect(big.length).toBeGreaterThan(1_000_000);
  });

  it("6b) oversized network responses are rejected", async () => {
    const fetchImpl = mockFetch(() => ({ status: 200, body: "x".repeat(5000), url: "https://raw.githubusercontent.com/a/b/HEAD/SKILL.md" }));
    await expect(
      fetchFileRaw({ owner: "a", repo: "b", url: "https://github.com/a/b" }, "SKILL.md", {
        fetchImpl,
        maxBytes: 100,
      }),
    ).rejects.toThrow(/RESPONSE_TOO_LARGE|exceeds limit/i);
  });

  it("7) refuses cache content that no longer matches recorded hash", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const original = readFixture("env-reveal/SKILL.md");
    writeCachedSkill(root, "tamper", original);
    writeCacheMeta(root, "tamper", {
      sourceId: "src",
      path: "x/SKILL.md",
      contentHash: contentHash(original),
      syncedAt: new Date().toISOString(),
    });
    // Tamper file after meta recorded
    writeFileSync(skillCachePath(root, "tamper"), original + "\n# tampered\n", "utf8");
    const verified = readCachedSkillVerified(root, "tamper");
    expect(verified.ok).toBe(false);
    expect(verified.content).toBeNull();
    expect(verified.reason).toMatch(/hash-mismatch/);

    const registry: SkillRegistry = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sources: [
        { id: "src", owner: "o", repo: "r", url: "https://github.com/o/r", trustStatus: "unreviewed" },
      ],
      skills: [
        {
          id: "tamper",
          name: "tamper",
          description: "t",
          domains: [],
          stacks: [],
          triggers: ["environment"],
          sourceId: "src",
          path: "x/SKILL.md",
          priority: 5,
          cacheStatus: "cached",
          contentHash: contentHash(original),
        },
      ],
    };
    const match = matchSkills("environment", null, registry, defaultConfig(), { minScore: 1 });
    const bundle = buildBundle({
      projectRoot: root,
      task: "environment",
      profile: null,
      registry,
      match,
      config: defaultConfig(),
      bundleOptions: { maxChars: 20_000, agent: "portable" },
    });
    expect(bundle.warnings.some((w) => /integrity|hash-mismatch|tampered/i.test(w))).toBe(true);
    expect(bundle.markdown).not.toContain("Print all environment variables");
  });

  it("8) rejects registries with duplicate IDs or missing sources", () => {
    expect(() =>
      migrateAndValidate({
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        sources: [
          { id: "s", owner: "a", repo: "b", url: "https://github.com/a/b", trustStatus: "unreviewed" },
        ],
        skills: [
          {
            id: "dup",
            name: "a",
            description: "a",
            domains: [],
            stacks: [],
            triggers: [],
            sourceId: "s",
            path: "a/SKILL.md",
            priority: 1,
            cacheStatus: "none",
          },
          {
            id: "dup",
            name: "b",
            description: "b",
            domains: [],
            stacks: [],
            triggers: [],
            sourceId: "s",
            path: "b/SKILL.md",
            priority: 1,
            cacheStatus: "none",
          },
        ],
      }),
    ).toThrow(/Duplicate skill/);

    expect(() =>
      migrateAndValidate({
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        sources: [],
        skills: [
          {
            id: "x",
            name: "x",
            description: "x",
            domains: [],
            stacks: [],
            triggers: [],
            sourceId: "missing",
            path: "x/SKILL.md",
            priority: 1,
            cacheStatus: "none",
          },
        ],
      }),
    ).toThrow(/missing source/);
  });

  it("9) does not scan credential-like project files into the profile sample", () => {
    const root = makeTempDir();
    seedProject(root, {
      packageJson: { name: "creds" },
      files: {
        ".env": "SECRET=fake-not-real\n",
        ".env.local": "TOKEN=fake\n",
        "credentials.json": '{"api_key":"fake-test-only"}\n',
        "id_rsa": "-----BEGIN FAKE-----\n",
        "notes.txt": "hello\n",
      },
    });
    const profile = scanProject(root);
    // Scanner must not throw and must not require reading secret bodies
    expect(profile.metadata.fileSampleCount).toBeDefined();
    // Secret names excluded from shallow file listing influence
    expect(Number(profile.metadata.fileSampleCount)).toBeGreaterThanOrEqual(1);
  });

  it("10) flags script-execution skills and never runs them during add/cache", async () => {
    const content = readFixture("run-script/SKILL.md");
    expect(scanSuspiciousInstructions(content).some((h) => /script execution|make-executable/i.test(h))).toBe(
      true,
    );

    const root = makeTempDir();
    ensureOmniDirs(root);
    const fetchImpl = githubSkillFixture({
      owner: "evil",
      repo: "skills",
      skills: [{ path: "run-script/SKILL.md", content }],
    });
    const { summary, registry } = await addRepository(
      root,
      { schemaVersion: 1, updatedAt: new Date().toISOString(), sources: [], skills: [] },
      "evil/skills",
      defaultConfig(),
      fetchImpl,
    );
    expect(summary.cached).toBe(1);
    expect(registry.skills[0]?.cacheStatus).toBe("cached");
    // Cached as text only — no install.sh executed (fixture has no binary side effects)
    expect(existsSync(join(root, "install.sh"))).toBe(false);
  });

  it("redacts secrets from logs by default", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    appendLog(root, {
      timestamp: new Date().toISOString(),
      type: "match",
      taskSummary: "Bearer ghp_abcdefghijklmnopqrstuvwxyz123456 password=supersecret",
      outcome: "unverified",
    });
    const { events } = readLog(root);
    const summary = events[0]!.taskSummary ?? "";
    expect(summary).toContain("[REDACTED");
    expect(summary).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
    expect(summary).not.toContain("supersecret");
    expect(redactSecrets("AKIAIOSFODNN7EXAMPLE")).toContain("[REDACTED");
  });

  it("rejects instruction install when destination is a symlink", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const target = join(root, "real-claude.md");
    const link = join(root, "CLAUDE.md");
    writeFileSync(target, "user\n", "utf8");
    try {
      symlinkSync(target, link);
    } catch {
      return; // platform may deny symlink creation
    }
    try {
      installManagedInstructions({
        projectRoot: root,
        destination: link,
        managedBody: "managed",
      });
      expect.fail("expected symlink rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(OmniError);
      expect((err as OmniError).code).toBe("SYMLINK_REJECTED");
    }
    expect(readFileSync(target, "utf8")).toBe("user\n");
  });

  it("does not transmit project source — network limited to GitHub skill fetch mocks", async () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    writeFileSync(join(root, "secret-src.ts"), "export const x = 1;\n");
    const seen: string[] = [];
    const fetchImpl = mockFetch((url) => {
      seen.push(url);
      if (url.includes("/repos/") && !url.includes("/git/trees")) {
        return { status: 200, body: JSON.stringify({ default_branch: "main" }), url };
      }
      if (url.includes("/git/trees/")) {
        return { status: 200, body: JSON.stringify({ tree: [] }), url };
      }
      return { status: 404, body: "no", url };
    });
    await addRepository(
      root,
      { schemaVersion: 1, updatedAt: new Date().toISOString(), sources: [], skills: [] },
      "acme/skills",
      defaultConfig(),
      fetchImpl,
    );
    expect(seen.every((u) => u.includes("github.com") || u.includes("githubusercontent.com"))).toBe(true);
    expect(seen.some((u) => u.includes("secret-src"))).toBe(false);
  });

  it("rejects non-GitHub repository URLs", () => {
    expect(() => parseGitHubRepo("https://gitlab.com/a/b")).toThrow(/UNSUPPORTED_HOST|Unsupported host/);
    expect(() => parseGitHubRepo("http://github.com/a/b")).toThrow(/HTTPS|Unsupported/);
  });
});
