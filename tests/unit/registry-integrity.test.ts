import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureOmniDirs, paths, atomicWriteJson } from "../../src/core/config.js";
import { OmniError } from "../../src/core/errors.js";
import {
  loadRegistry,
  loadSeedRegistry,
  migrateAndValidate,
  saveRegistry,
} from "../../src/core/registry.js";
import { makeTempDir } from "../helpers/temp.js";

describe("registry integrity", () => {
  it("rejects malformed JSON on disk", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    writeFileSync(paths(root).registry, "{broken", "utf8");
    expect(() => loadRegistry(root)).toThrow(OmniError);
    expect(() => loadRegistry(root)).toThrow(/corrupt|REGISTRY/i);
  });

  it("does not silently replace invalid schema with defaults", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    writeFileSync(
      paths(root).registry,
      JSON.stringify({ schemaVersion: 1, updatedAt: "x", sources: [], skills: [{ id: "x" }] }),
      "utf8",
    );
    expect(() => loadRegistry(root)).toThrow(OmniError);
    // seed still available separately
    expect(loadSeedRegistry().skills.length).toBeGreaterThan(0);
  });

  it("rejects duplicate source ids", () => {
    expect(() =>
      migrateAndValidate({
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        sources: [
          {
            id: "dup",
            owner: "a",
            repo: "b",
            url: "https://github.com/a/b",
            trustStatus: "unreviewed",
          },
          {
            id: "dup",
            owner: "c",
            repo: "d",
            url: "https://github.com/c/d",
            trustStatus: "unreviewed",
          },
        ],
        skills: [],
      }),
    ).toThrow(/Duplicate source/);
  });

  it("rejects unsupported schema versions", () => {
    expect(() =>
      migrateAndValidate({
        schemaVersion: 99,
        updatedAt: new Date().toISOString(),
        sources: [],
        skills: [],
      }),
    ).toThrow(/Unsupported registry schemaVersion/);
  });

  it("survives interrupted write leftovers (.tmp beside valid registry)", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const reg = loadSeedRegistry();
    saveRegistry(root, reg);
    const file = paths(root).registry;
    writeFileSync(`${file}.999.123.tmp`, "{partial", "utf8");
    const loaded = loadRegistry(root);
    expect(loaded.skills.length).toBe(reg.skills.length);
    expect(existsSync(`${file}.999.123.tmp`)).toBe(true);
  });

  it("atomic write replaces registry without leaving empty file", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const file = paths(root).registry;
    atomicWriteJson(file, loadSeedRegistry());
    const text = readFileSync(file, "utf8");
    expect(text.trim().startsWith("{")).toBe(true);
    expect(JSON.parse(text).schemaVersion).toBe(1);
  });

  it("round-trips save/load validation", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const seed = loadSeedRegistry();
    saveRegistry(root, seed);
    const again = loadRegistry(root);
    expect(again.sources.map((s) => s.id).sort()).toEqual(seed.sources.map((s) => s.id).sort());
  });
});
