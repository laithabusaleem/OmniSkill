import { describe, expect, it } from "vitest";
import { buildBundle } from "../../src/core/bundle-builder.js";
import { writeCachedSkill } from "../../src/core/cache.js";
import { defaultConfig, ensureOmniDirs } from "../../src/core/config.js";

import { matchSkills } from "../../src/core/matcher.js";
import { resolveInsideRoot } from "../../src/core/security.js";
import { OmniError } from "../../src/core/errors.js";
import type { ProjectProfile, SkillRegistry } from "../../src/types/index.js";
import { makeTempDir } from "../helpers/temp.js";

function profile(root: string): ProjectProfile {
  return {
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
}

describe("bundle export edge cases", () => {
  it("attributes sources and uses agent-specific header", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    writeCachedSkill(
      root,
      "s1",
      `---
name: one
description: one
---
Instruction one
`,
    );
    const registry: SkillRegistry = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sources: [
        {
          id: "src",
          owner: "acme",
          repo: "skills",
          url: "https://github.com/acme/skills",
          trustStatus: "unreviewed",
        },
      ],
      skills: [
        {
          id: "s1",
          name: "one",
          description: "one",
          domains: ["frontend"],
          stacks: ["react"],
          triggers: ["panel"],
          sourceId: "src",
          path: "one/SKILL.md",
          priority: 7,
          cacheStatus: "cached",
        },
      ],
    };
    const match = matchSkills("panel", profile(root), registry, defaultConfig(), { minScore: 1 });
    const bundle = buildBundle({
      projectRoot: root,
      task: "panel",
      profile: profile(root),
      registry,
      match,
      config: defaultConfig(),
      bundleOptions: { maxChars: 48_000, agent: "claude-code" },
    });
    expect(bundle.markdown).toContain("Agent target: claude-code");
    expect(bundle.markdown).toContain("acme/skills");
    expect(bundle.markdown).toContain("https://github.com/acme/skills");
    expect(bundle.markdown).toContain("Untrusted skill instructions");
    expect(bundle.markdown).toContain("## Provenance");
    expect(bundle.path).toContain(".omni");
    expect(bundle.path).toContain("bundles");
  });

  it("deduplicates identical cached instruction bodies", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const body = `---
name: dup
description: dup
---
SAME_BODY
`;
    writeCachedSkill(root, "a", body);
    writeCachedSkill(root, "b", body);
    const registry: SkillRegistry = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sources: [
        { id: "src", owner: "o", repo: "r", url: "https://github.com/o/r", trustStatus: "unreviewed" },
      ],
      skills: [
        {
          id: "a",
          name: "a",
          description: "a",
          domains: [],
          stacks: [],
          triggers: ["duplex"],
          sourceId: "src",
          path: "a/SKILL.md",
          priority: 8,
          cacheStatus: "cached",
        },
        {
          id: "b",
          name: "b",
          description: "b",
          domains: [],
          stacks: [],
          triggers: ["duplex"],
          sourceId: "src",
          path: "b/SKILL.md",
          priority: 7,
          cacheStatus: "cached",
        },
      ],
    };
    const match = matchSkills("duplex", null, registry, defaultConfig(), { minScore: 1 });
    const bundle = buildBundle({
      projectRoot: root,
      task: "duplex",
      profile: null,
      registry,
      match,
      config: defaultConfig(),
      bundleOptions: { maxChars: 48_000, agent: "portable" },
    });
    expect(bundle.markdown).toContain("Duplicate content skipped");
    expect((bundle.markdown.match(/SAME_BODY/g) ?? []).length).toBe(1);
  });

  it("rejects unsafe path resolution for skill resources", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    expect(() => resolveInsideRoot(root, "../escape.txt")).toThrow(OmniError);
  });
});
