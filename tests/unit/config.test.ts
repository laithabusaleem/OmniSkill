import { describe, expect, it } from "vitest";
import { defaultConfig, OmniConfigSchema } from "../../src/core/config.js";

describe("config", () => {
  it("defaultConfig returns schemaVersion 1 without throwing", () => {
    const cfg = defaultConfig();
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.matching.maxSkills).toBe(5);
    expect(cfg.network.timeoutMs).toBeGreaterThan(0);
  });

  it("parses empty object via schema defaults", () => {
    const cfg = OmniConfigSchema.parse({});
    expect(cfg.schemaVersion).toBe(1);
  });
});
