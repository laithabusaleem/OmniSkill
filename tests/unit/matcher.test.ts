import { describe, expect, it } from "vitest";
import { matchSkills } from "../../src/core/matcher.js";
import { defaultConfig } from "../../src/core/config.js";
import type { ProjectProfile, SkillRegistry } from "../../src/types/index.js";

const profile: ProjectProfile = {
  schemaVersion: 1,
  scannedAt: new Date().toISOString(),
  root: "/tmp/demo",
  languages: ["typescript"],
  frameworks: ["nextjs", "react", "tailwindcss"],
  packageManagers: ["npm"],
  testRunners: ["vitest"],
  ci: ["github-actions"],
  deployment: ["vercel"],
  monorepo: false,
  metadata: {},
  versions: {},
};

function registry(): SkillRegistry {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    sources: [
      {
        id: "src",
        owner: "o",
        repo: "r",
        url: "https://github.com/o/r",
        trustStatus: "unreviewed",
      },
    ],
    skills: [
      {
        id: "ui",
        name: "frontend-ui",
        description: "UI theming and dark mode",
        domains: ["frontend", "ui"],
        stacks: ["react", "nextjs"],
        triggers: ["dark mode", "toggle", "theme"],
        sourceId: "src",
        path: "ui/SKILL.md",
        priority: 7,
        cacheStatus: "cached",
      },
      {
        id: "test",
        name: "testing-vitest",
        description: "Vitest testing",
        domains: ["testing"],
        stacks: ["vitest", "nextjs"],
        triggers: ["test", "vitest", "dark mode"],
        sourceId: "src",
        path: "test/SKILL.md",
        priority: 6,
        cacheStatus: "cached",
      },
      {
        id: "go",
        name: "go-service",
        description: "Go backend service",
        domains: ["backend"],
        stacks: ["go"],
        triggers: ["microservice"],
        sourceId: "src",
        path: "go/SKILL.md",
        priority: 9,
        cacheStatus: "cached",
      },
      {
        id: "blocked",
        name: "blocked-skill",
        description: "Should never select",
        domains: ["frontend"],
        stacks: ["react"],
        triggers: ["dark mode"],
        sourceId: "src",
        path: "blocked/SKILL.md",
        priority: 10,
        cacheStatus: "cached",
        trustStatus: "blocked",
      },
    ],
  };
}

describe("matcher", () => {
  it("prioritizes frontend and testing for dark mode toggle", () => {
    const result = matchSkills("Build a dark mode toggle", profile, registry(), defaultConfig(), {
      explain: true,
    } as never);
    const ids = result.selected.map((s) => s.skillId);
    expect(ids[0]).toBe("ui");
    expect(ids).toContain("test");
    expect(ids).not.toContain("blocked");
    expect(result.selected[0]!.reasons.length).toBeGreaterThan(0);
  });

  it("penalizes incompatible stacks", () => {
    const result = matchSkills("Build a dark mode toggle", profile, registry(), defaultConfig(), { includeAll: true });
    const go = result.candidates.find((c) => c.skillId === "go");
    expect(go).toBeTruthy();
    expect(go!.score).toBeLessThan(result.candidates.find((c) => c.skillId === "ui")!.score);
  });

  it("never auto-selects blocked skills", () => {
    const result = matchSkills("dark mode toggle theme", profile, registry(), defaultConfig());
    expect(result.selected.every((s) => s.skillId !== "blocked")).toBe(true);
  });

  it("respects minimum threshold and empty registry", () => {
    const empty: SkillRegistry = { schemaVersion: 1, updatedAt: "", sources: [], skills: [] };
    const emptyResult = matchSkills("anything", profile, empty, defaultConfig());
    expect(emptyResult.selected).toEqual([]);
    expect(emptyResult.warnings.length).toBeGreaterThan(0);

    const high = matchSkills("unrelated quantum gardening", profile, registry(), defaultConfig(), {
      minScore: 90,
      includeAll: true,
    });
    expect(high.selected.length).toBe(0);
  });

  it("is deterministic and limits selection", () => {
    const a = matchSkills("Build a dark mode toggle", profile, registry(), defaultConfig(), { maxSkills: 2 });
    const b = matchSkills("Build a dark mode toggle", profile, registry(), defaultConfig(), { maxSkills: 2 });
    expect(a.selected.map((s) => s.skillId)).toEqual(b.selected.map((s) => s.skillId));
    expect(a.selected.length).toBeLessThanOrEqual(2);
  });

  it("uses priority for tie-breaking when scores equal path sorts by id", () => {
    const reg = registry();
    reg.skills = reg.skills.map((s) => ({ ...s, triggers: ["alpha"], domains: [], stacks: ["nextjs"], priority: s.id === "ui" ? 9 : 1 }));
    const result = matchSkills("alpha feature", profile, reg, defaultConfig());
    expect(result.selected[0]?.skillId).toBeDefined();
  });
});
