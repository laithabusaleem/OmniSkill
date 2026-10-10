import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../../src/commands/init.js";
import { ensureOmniDirs, paths } from "../../src/core/config.js";
import { runDoctor } from "../../src/core/doctor.js";
import { saveRegistry, loadSeedRegistry } from "../../src/core/registry.js";
import { makeTempDir, seedProject } from "../helpers/temp.js";

async function silentInit(cwd: string, yes = true): Promise<void> {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    await runInit({ cwd, yes });
  } finally {
    process.stdout.write = original;
  }
}

describe("doctor edge cases", () => {
  it("offline doctor does not FAIL solely because GitHub is unreachable", async () => {
    const cwd = makeTempDir();
    seedProject(cwd);
    await silentInit(cwd, true);
    const checks = await runDoctor(cwd, {
      online: true,
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });
    const online = checks.find((c) => c.id === "online-source");
    expect(online?.status).toBe("WARN");
    expect(checks.filter((c) => c.status === "FAIL").length).toBe(0);
  });

  it("warns when cacheStatus cached but file missing", async () => {
    const cwd = makeTempDir();
    seedProject(cwd);
    ensureOmniDirs(cwd);
    const reg = loadSeedRegistry();
    reg.skills = reg.skills.map((s, i) =>
      i === 0 ? { ...s, cacheStatus: "cached" as const } : s,
    );
    saveRegistry(cwd, reg);
    writeFileSync(paths(cwd).profile, JSON.stringify({ schemaVersion: 1, scannedAt: new Date().toISOString() }));
    const checks = await runDoctor(cwd);
    const cache = checks.find((c) => c.id === "cache-consistency");
    expect(cache?.status).toBe("WARN");
  });

  it("reports marker failures", async () => {
    const cwd = makeTempDir();
    seedProject(cwd);
    await silentInit(cwd, true);
    writeFileSync(
      join(cwd, "CLAUDE.md"),
      "<!-- OMNISKILL:BEGIN -->\n<!-- OMNISKILL:BEGIN -->\n<!-- OMNISKILL:END -->\n",
      "utf8",
    );
    const checks = await runDoctor(cwd);
    expect(checks.some((c) => c.id.startsWith("markers:") && c.status === "FAIL")).toBe(true);
  });
});
