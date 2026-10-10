import { describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/core/config.js";
import { matchSkills } from "../../src/core/matcher.js";
import type { ProjectProfile, SkillRecord, SkillRegistry } from "../../src/types/index.js";

function baseProfile(overrides: Partial<ProjectProfile> = {}): ProjectProfile {
  return {
    schemaVersion: 1,
    scannedAt: new Date().toISOString(),
    root: "/tmp/p",
    languages: ["typescript"],
    frameworks: ["nextjs", "react"],
    packageManagers: ["npm"],
    testRunners: ["vitest"],
    ci: [],
    deployment: [],
    monorepo: false,
    metadata: {},
    versions: {},
    ...overrides,
  };
}

function skill(partial: Partial<SkillRecord> & Pick<SkillRecord, "id" | "name">): SkillRecord {
  return {
    description: partial.description ?? `${partial.name} skill`,
    domains: partial.domains ?? [],
    stacks: partial.stacks ?? [],
    triggers: partial.triggers ?? [],
    sourceId: "src",
    path: `${partial.id}/SKILL.md`,
    priority: partial.priority ?? 5,
    cacheStatus: partial.cacheStatus ?? "cached",
    disabled: partial.disabled,
    trustStatus: partial.trustStatus,
    ...partial,
  };
}

function reg(skills: SkillRecord[]): SkillRegistry {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    sources: [
      { id: "src", owner: "o", repo: "r", url: "https://github.com/o/r", trustStatus: "unreviewed" },
    ],
    skills,
  };
}

describe("matcher quality", () => {
  it("scores keyword overlap without double-counting repeated tokens", () => {
    const registry = reg([
      skill({
        id: "a",
        name: "auth",
        triggers: ["auth", "auth", "authentication"],
        domains: ["security"],
        stacks: ["typescript"],
      }),
    ]);
    const once = matchSkills("auth auth auth authentication", baseProfile(), registry, defaultConfig(), {
      includeAll: true,
    });
    const twice = matchSkills("authentication", baseProfile(), registry, defaultConfig(), { includeAll: true });
    // repeated task tokens should not explode scores unboundedly
    expect(once.candidates[0]!.score).toBeLessThan(120);
    expect(once.candidates[0]!.score).toBeGreaterThanOrEqual(twice.candidates[0]!.score - 5);
  });

  it("applies preference boosts", () => {
    const registry = reg([
      skill({ id: "ui", name: "ui", domains: ["frontend"], stacks: ["react"], triggers: ["widget"] }),
      skill({ id: "api", name: "api", domains: ["backend"], stacks: ["nodejs"], triggers: ["widget"] }),
    ]);
    const result = matchSkills("widget", baseProfile(), registry, defaultConfig(), {
      preferences: { preferDomains: ["frontend"] },
    });
    expect(result.selected[0]!.skillId).toBe("ui");
  });

  it("excludes disabled and quarantined skills from selection", () => {
    const registry = reg([
      skill({
        id: "ok",
        name: "ok",
        triggers: ["dark mode"],
        domains: ["frontend"],
        stacks: ["react"],
        priority: 1,
      }),
      skill({
        id: "off",
        name: "off",
        triggers: ["dark mode"],
        domains: ["frontend"],
        stacks: ["react"],
        priority: 10,
        disabled: true,
      }),
      skill({
        id: "q",
        name: "q",
        triggers: ["dark mode"],
        domains: ["frontend"],
        stacks: ["react"],
        priority: 10,
        trustStatus: "quarantined",
      }),
    ]);
    const result = matchSkills("dark mode toggle", baseProfile(), registry, defaultConfig());
    expect(result.selected.map((s) => s.skillId)).toEqual(["ok"]);
  });

  it("marks unavailable caches in candidate availability", () => {
    const registry = reg([
      skill({
        id: "uncached",
        name: "uncached",
        triggers: ["theme"],
        stacks: ["react"],
        cacheStatus: "none",
        priority: 8,
      }),
    ]);
    const result = matchSkills("theme", baseProfile(), registry, defaultConfig(), { minScore: 1, includeAll: true });
    expect(result.candidates[0]!.available).toBe(false);
    expect(result.candidates[0]!.reasons.some((r) => /unavailable until sync/i.test(r))).toBe(true);
  });

  it("breaks ties deterministically by skill id", () => {
    const registry = reg([
      skill({ id: "b-skill", name: "b", triggers: ["zeta"], stacks: ["react"], priority: 5 }),
      skill({ id: "a-skill", name: "a", triggers: ["zeta"], stacks: ["react"], priority: 5 }),
    ]);
    const a = matchSkills("zeta", baseProfile(), registry, defaultConfig());
    const b = matchSkills("zeta", baseProfile(), registry, defaultConfig());
    expect(a.selected.map((s) => s.skillId)).toEqual(b.selected.map((s) => s.skillId));
    expect(a.selected[0]!.skillId).toBe("a-skill");
  });

  it("respects exact threshold boundary", () => {
    const registry = reg([
      skill({ id: "edge", name: "edge", triggers: ["uniquekeywordxyz"], stacks: [], priority: 0, cacheStatus: "none" }),
    ]);
    const cfg = defaultConfig();
    const scored = matchSkills("uniquekeywordxyz", null, registry, cfg, { includeAll: true, minScore: 0 });
    const score = scored.candidates[0]!.score;
    const below = matchSkills("uniquekeywordxyz", null, registry, cfg, { minScore: score + 0.1 });
    const at = matchSkills("uniquekeywordxyz", null, registry, cfg, { minScore: score });
    expect(below.selected.length).toBe(0);
    expect(at.selected.length).toBe(1);
  });

  it("trusted skills outrank otherwise equal unreviewed skills", () => {
    const registry = reg([
      skill({
        id: "t",
        name: "trusted",
        triggers: ["payment"],
        stacks: ["typescript"],
        trustStatus: "trusted",
        priority: 5,
      }),
      skill({
        id: "u",
        name: "unreviewed",
        triggers: ["payment"],
        stacks: ["typescript"],
        trustStatus: "unreviewed",
        priority: 5,
      }),
    ]);
    const result = matchSkills("payment", baseProfile(), registry, defaultConfig());
    expect(result.selected[0]!.skillId).toBe("t");
  });
});
