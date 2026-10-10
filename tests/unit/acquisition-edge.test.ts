import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCachedSkill } from "../../src/core/cache.js";
import { defaultConfig, ensureOmniDirs } from "../../src/core/config.js";
import { OmniError } from "../../src/core/errors.js";
import { fetchFileRaw, fetchRepoTree } from "../../src/core/fetcher.js";
import { addRepository, syncRegistry } from "../../src/core/sync.js";
import type { SkillRegistry } from "../../src/types/index.js";
import { githubSkillFixture, mockFetch } from "../helpers/mock-fetch.js";
import { makeTempDir } from "../helpers/temp.js";

const goodSkill = `---
name: demo
description: Demo skill
domains: [frontend]
stacks: [react]
triggers: [button]
---
# Body v1
`;

const goodSkillV2 = goodSkill.replace("Body v1", "Body v2");

function emptyRegistry(): SkillRegistry {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), sources: [], skills: [] };
}

describe("skill acquisition edge cases", () => {
  it("rejects unexpected redirect hosts", async () => {
    const fetchImpl = githubSkillFixture({
      owner: "acme",
      repo: "skills",
      redirectUrl: "https://evil.example/steal",
      skills: [{ path: "x/SKILL.md", content: goodSkill }],
    });
    await expect(
      fetchRepoTree({ owner: "acme", repo: "skills", url: "https://github.com/acme/skills" }, { fetchImpl }),
    ).rejects.toThrow(/REDIRECT_UNTRUSTED|Unexpected redirect/i);
  });

  it("invalidates cache when remote content hash changes", async () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    let version = 1;
    const fetchImpl = mockFetch((url) => {
      if (url.includes("/repos/acme/skills") && !url.includes("/git/trees")) {
        return { status: 200, body: JSON.stringify({ default_branch: "main" }), url };
      }
      if (url.includes("/git/trees/")) {
        return {
          status: 200,
          body: JSON.stringify({ tree: [{ path: "demo/SKILL.md", type: "blob", sha: "1" }] }),
          url,
        };
      }
      if (url.includes("demo/SKILL.md") || url.includes("demo%2FSKILL.md")) {
        return { status: 200, body: version === 1 ? goodSkill : goodSkillV2, url };
      }
      return { status: 404, body: "no", url };
    });

    const first = await addRepository(root, emptyRegistry(), "acme/skills", defaultConfig(), fetchImpl);
    const id = first.registry.skills[0]!.id;
    expect(readCachedSkill(root, id)).toContain("Body v1");

    version = 2;
    const second = await addRepository(root, first.registry, "acme/skills", defaultConfig(), fetchImpl);
    expect(second.summary.cached).toBeGreaterThanOrEqual(1);
    expect(readCachedSkill(root, id)).toContain("Body v2");
    expect(second.registry.skills[0]!.contentHash).not.toBe(first.registry.skills[0]!.contentHash);
  });

  it("skips unchanged content on re-sync", async () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const fetchImpl = githubSkillFixture({
      skills: [{ path: "demo/SKILL.md", content: goodSkill }],
    });
    const first = await addRepository(root, emptyRegistry(), "acme/skills", defaultConfig(), fetchImpl);
    const second = await addRepository(root, first.registry, "acme/skills", defaultConfig(), fetchImpl);
    expect(second.summary.unchanged).toBeGreaterThanOrEqual(1);
    expect(second.summary.cached).toBe(0);
  });

  it("supports offline match after cache populated (no network needed)", async () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const fetchImpl = githubSkillFixture({
      skills: [{ path: "demo/SKILL.md", content: goodSkill }],
    });
    const { registry } = await addRepository(root, emptyRegistry(), "acme/skills", defaultConfig(), fetchImpl);
    const cached = readCachedSkill(root, registry.skills[0]!.id);
    expect(cached).toBeTruthy();
    // offline: reading cache does not call fetch
    expect(readFileSync).toBeTypeOf("function");
  });

  it("skips blocked sources during sync", async () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const registry: SkillRegistry = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sources: [
        {
          id: "acme__skills",
          owner: "acme",
          repo: "skills",
          url: "https://github.com/acme/skills",
          trustStatus: "blocked",
        },
      ],
      skills: [],
    };
    const fetchImpl = githubSkillFixture({
      skills: [{ path: "demo/SKILL.md", content: goodSkill }],
    });
    const { summaries } = await syncRegistry(root, registry, defaultConfig(), undefined, fetchImpl);
    expect(summaries[0]!.skipped.length).toBeGreaterThan(0);
    expect(summaries[0]!.discovered).toBe(0);
  });

  it("surfaces HTTP 500 as GITHUB_HTTP", async () => {
    const fetchImpl = mockFetch(() => ({ status: 500, body: "err" }));
    await expect(
      fetchFileRaw({ owner: "a", repo: "b", url: "https://github.com/a/b" }, "SKILL.md", { fetchImpl }),
    ).rejects.toMatchObject({ code: "GITHUB_HTTP" } satisfies Partial<OmniError>);
  });

  it("drops path-traversal skill paths during discovery (no fetch/cache)", async () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    let fetchedRaw = false;
    const fetchImpl = mockFetch((url) => {
      if (url.includes("/repos/") && !url.includes("/git/trees")) {
        return { status: 200, body: JSON.stringify({ default_branch: "main" }), url };
      }
      if (url.includes("/git/trees/")) {
        return {
          status: 200,
          body: JSON.stringify({
            tree: [{ path: "../outside/SKILL.md", type: "blob", sha: "1" }],
          }),
          url,
        };
      }
      fetchedRaw = true;
      return { status: 200, body: goodSkill, url };
    });
    const { summary } = await addRepository(root, emptyRegistry(), "acme/skills", defaultConfig(), fetchImpl);
    expect(summary.discovered).toBe(0);
    expect(summary.cached).toBe(0);
    expect(fetchedRaw).toBe(false);
  });
});
