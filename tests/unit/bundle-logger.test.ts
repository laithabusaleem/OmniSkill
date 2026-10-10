import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildBundle } from "../../src/core/bundle-builder.js";
import { ensureOmniDirs, defaultConfig } from "../../src/core/config.js";
import { writeCachedSkill } from "../../src/core/cache.js";
import { appendLog, readLog, summarizeLog } from "../../src/core/logger.js";
import { matchSkills } from "../../src/core/matcher.js";
import type { ProjectProfile, SkillRegistry } from "../../src/types/index.js";

describe("bundle builder", () => {
  it("orders skills, marks untrusted boundaries, handles missing cache", () => {
    const root = join(tmpdir(), `omniskill-bundle-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    ensureOmniDirs(root);

    const registry: SkillRegistry = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sources: [
        { id: "src", owner: "o", repo: "r", url: "https://github.com/o/r", trustStatus: "unreviewed" },
      ],
      skills: [
        {
          id: "a",
          name: "alpha",
          description: "alpha skill for dark mode",
          domains: ["frontend"],
          stacks: ["react"],
          triggers: ["dark mode"],
          sourceId: "src",
          path: "a/SKILL.md",
          priority: 8,
          cacheStatus: "cached",
        },
        {
          id: "b",
          name: "beta",
          description: "beta",
          domains: ["frontend"],
          stacks: ["react"],
          triggers: ["dark mode"],
          sourceId: "src",
          path: "b/SKILL.md",
          priority: 5,
          cacheStatus: "none",
        },
      ],
    };

    writeCachedSkill(
      root,
      "a",
      `---
name: alpha
description: alpha skill for dark mode
---
Body A
`,
    );

    const profile: ProjectProfile = {
      schemaVersion: 1,
      scannedAt: new Date().toISOString(),
      root,
      languages: ["typescript"],
      frameworks: ["react"],
      packageManagers: ["npm"],
      testRunners: [],
      ci: [],
      deployment: [],
      monorepo: false,
      metadata: {},
      versions: {},
    };

    const match = matchSkills("dark mode", profile, registry, defaultConfig());
    const bundle = buildBundle({
      projectRoot: root,
      task: "dark mode",
      profile,
      registry,
      match,
      config: defaultConfig(),
      bundleOptions: { maxChars: 48_000, agent: "portable" },
    });

    expect(bundle.markdown).toContain("OmniSkill security policy (trusted");
    expect(bundle.markdown).toContain("Untrusted skill instructions");
    expect(bundle.warnings.some((w) => w.includes("Missing cached"))).toBe(true);
  });

  it("respects size limits without dropping security policy", () => {
    const root = join(tmpdir(), `omniskill-bundle2-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    ensureOmniDirs(root);
    writeCachedSkill(
      root,
      "a",
      `---
name: alpha
description: alpha
---
${"X".repeat(5000)}
`,
    );
    const registry: SkillRegistry = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sources: [
        { id: "src", owner: "o", repo: "r", url: "https://github.com/o/r", trustStatus: "unreviewed" },
      ],
      skills: [
        {
          id: "a",
          name: "alpha",
          description: "alpha",
          domains: ["frontend"],
          stacks: [],
          triggers: ["dark"],
          sourceId: "src",
          path: "a/SKILL.md",
          priority: 8,
          cacheStatus: "cached",
        },
      ],
    };
    const match = matchSkills("dark", null, registry, defaultConfig(), { minScore: 1 });
    const bundle = buildBundle({
      projectRoot: root,
      task: "dark",
      profile: null,
      registry,
      match,
      config: defaultConfig(),
      bundleOptions: { maxChars: 1500, agent: "portable" },
    });
    expect(bundle.truncated).toBe(true);
    expect(bundle.markdown).toContain("OmniSkill security policy (trusted");
  });
});

describe("logger", () => {
  it("writes JSONL, recovers corrupt lines, redacts secrets", () => {
    const root = join(tmpdir(), `omniskill-log-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    ensureOmniDirs(root);
    appendLog(root, {
      timestamp: new Date().toISOString(),
      type: "match",
      taskSummary: "api_key=supersecret123 do thing",
      outcome: "unverified",
    });
    const logPath = join(root, ".omni", "log.jsonl");
    writeFileSync(logPath, `${readFileSync(logPath, "utf8")}not-json\n`, "utf8");
    const { events, corruptLines } = readLog(root);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(corruptLines).toBeGreaterThanOrEqual(1);
    expect(events[0]!.taskSummary).toContain("[REDACTED]");
    const stats = summarizeLog(events);
    expect(stats.totalEvents).toBe(events.length);
  });

  it("handles empty history", () => {
    const root = join(tmpdir(), `omniskill-log2-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    ensureOmniDirs(root);
    const { events } = readLog(root);
    expect(events).toEqual([]);
  });
});
