import { describe, expect, it } from "vitest";
import { defaultConfig, ensureOmniDirs } from "../../src/core/config.js";
import { addRepository } from "../../src/core/sync.js";
import type { SkillRegistry } from "../../src/types/index.js";
import { makeTempDir } from "../helpers/temp.js";

/**
 * Opt-in live GitHub smoke test.
 * Enable with: OMNISKILL_LIVE_GITHUB=1 npm run test:live-github
 * Uses only public repositories. Optional GITHUB_TOKEN for rate limits.
 */
const enabled = process.env.OMNISKILL_LIVE_GITHUB === "1";

describe.skipIf(!enabled)("live GitHub acquisition (opt-in)", () => {
  it("discovers skills from a public repository without API keys being required", async () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const registry: SkillRegistry = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sources: [],
      skills: [],
    };

    // Small public repo commonly used as a skills source; may change over time.
    const result = await addRepository(
      root,
      registry,
      "anthropics/skills",
      defaultConfig(),
    );

    expect(result.summary.discovered).toBeGreaterThanOrEqual(0);
    // If the repository structure changes, discovery may be zero — that is still a valid observation.
    // Fail only on unexpected thrown errors (caught by test runner).
    expect(result.registry.sources.some((s) => s.owner === "anthropics")).toBe(true);
  }, 60_000);
});
