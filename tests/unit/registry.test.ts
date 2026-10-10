import { describe, expect, it } from "vitest";
import { migrateAndValidate, loadSeedRegistry } from "../../src/core/registry.js";
import { OmniError } from "../../src/core/errors.js";

describe("registry", () => {
  it("loads seed registry", () => {
    const reg = loadSeedRegistry();
    expect(reg.schemaVersion).toBe(1);
    expect(reg.sources.length).toBeGreaterThanOrEqual(4);
    expect(reg.skills.length).toBeGreaterThan(0);
  });

  it("rejects invalid schema", () => {
    expect(() => migrateAndValidate({ schemaVersion: 1, updatedAt: "x", sources: [], skills: "nope" })).toThrow(
      OmniError,
    );
  });

  it("rejects duplicate skill ids", () => {
    const base = loadSeedRegistry();
    const dup = {
      ...base,
      skills: [base.skills[0]!, { ...base.skills[0]!, name: "other" }],
    };
    expect(() => migrateAndValidate(dup)).toThrow(/Duplicate skill/);
  });

  it("rejects missing source references", () => {
    const base = loadSeedRegistry();
    const bad = {
      ...base,
      skills: [{ ...base.skills[0]!, sourceId: "missing-source" }],
    };
    expect(() => migrateAndValidate(bad)).toThrow(/missing source/);
  });

  it("migrates schemaVersion 0", () => {
    const migrated = migrateAndValidate({
      schemaVersion: 0,
      sources: [
        {
          id: "a__b",
          owner: "a",
          repo: "b",
          url: "https://github.com/a/b",
          trustStatus: "unreviewed",
        },
      ],
      skills: [],
    });
    expect(migrated.schemaVersion).toBe(1);
  });

  it("rejects corrupt non-object", () => {
    expect(() => migrateAndValidate(null)).toThrow(OmniError);
  });
});
