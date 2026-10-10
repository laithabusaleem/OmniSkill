import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runInit } from "../../src/commands/init.js";

async function withSilentStdout<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await fn();
  } finally {
    process.stdout.write = original;
  }
}

describe("init confirmation", () => {
  it("does not write CLAUDE.md without --yes (regression: silent install)", async () => {
    const cwd = join(tmpdir(), `omniskill-init-confirm-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "x" }));

    const code = await withSilentStdout(() => runInit({ cwd }));
    expect(code).toBe(0);
    expect(existsSync(join(cwd, ".omni", "profile.json"))).toBe(true);
    expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(false);
  });

  it("writes CLAUDE.md with --yes", async () => {
    const cwd = join(tmpdir(), `omniskill-init-yes-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "x" }));

    const code = await withSilentStdout(() => runInit({ cwd, yes: true }));
    expect(code).toBe(0);
    expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(true);
  });
});
