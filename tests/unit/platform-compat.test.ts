import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getAdapter, assertCursorRuleFormat, listAdapters } from "../../src/core/agent-adapters.js";
import { atomicWriteJson, atomicWriteText, ensureOmniDirs, paths } from "../../src/core/config.js";
import { writeCachedSkill, skillCachePath } from "../../src/core/cache.js";
import { BEGIN_MARKER, installManagedInstructions, rollbackFromBackup } from "../../src/core/installer.js";
import { scanProject } from "../../src/core/scanner.js";
import { makeTempDir, seedProject } from "../helpers/temp.js";

const repoRoot = join(import.meta.dirname, "..", "..");
const cli = join(repoRoot, "dist", "cli.js");

describe(`platform-sensitive logic (${process.platform})`, () => {
  it("handles spaces and unicode in project and cache paths", () => {
    const root = join(makeTempDir(), "My Project 测试", "app");
    mkdirSync(root, { recursive: true });
    seedProject(root, {
      packageJson: { name: "spaced-unicode" },
      files: { "файл.ts": "export {}\n" },
    });
    ensureOmniDirs(root);
    const profile = scanProject(root);
    expect(profile.root).toContain("My Project");
    writeCachedSkill(root, "skill-α", "---\nname: u\ndescription: d\n---\nbody\n");
    expect(existsSync(skillCachePath(root, "skill-α"))).toBe(true);
    expect(readFileSync(skillCachePath(root, "skill-α"), "utf8")).toContain("body");
  });

  it("atomic writes replace JSON without empty destination", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const file = paths(root).config;
    atomicWriteJson(file, { schemaVersion: 1, agent: "claude-code" });
    atomicWriteJson(file, { schemaVersion: 1, agent: "cursor" });
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { agent: string };
    expect(parsed.agent).toBe("cursor");
    expect(readFileSync(file, "utf8").trim().length).toBeGreaterThan(2);
  });

  it("preserves CRLF user content outside managed markers", () => {
    const root = makeTempDir();
    const dest = join(root, "CLAUDE.md");
    writeFileSync(dest, "# Title\r\nKeep\r\n", "utf8");
    installManagedInstructions({ projectRoot: root, destination: dest, managedBody: "managed" });
    const next = readFileSync(dest, "utf8");
    expect(next.startsWith("# Title\r\nKeep\r\n")).toBe(true);
    expect(next).toContain(BEGIN_MARKER);
  });

  it("atomicWriteText works for dedicated files", () => {
    const root = makeTempDir();
    const dest = join(root, "out.txt");
    atomicWriteText(dest, "one\n");
    atomicWriteText(dest, "two\n");
    expect(readFileSync(dest, "utf8")).toBe("two\n");
  });

  it("respects file permission errors on POSIX without crashing scan", () => {
    const root = makeTempDir();
    seedProject(root, { packageJson: { name: "perm" } });
    const locked = join(root, "locked");
    mkdirSync(locked);
    writeFileSync(join(locked, "x.txt"), "x");
    if (process.platform !== "win32") {
      chmodSync(locked, 0);
      expect(() => scanProject(root)).not.toThrow();
      chmodSync(locked, 0o755);
    } else {
      expect(() => scanProject(root)).not.toThrow();
    }
  });

  it("CLI exit codes: help 0, uninit nonzero", () => {
    if (!existsSync(cli)) {
      throw new Error("dist/cli.js missing — build first");
    }
    const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
    expect(help.status).toBe(0);
    const cwd = makeTempDir();
    mkdirSync(cwd, { recursive: true });
    const bad = spawnSync(process.execPath, [cli, "scan"], { cwd, encoding: "utf8" });
    expect(bad.status).not.toBe(0);
  });

  it("shebang present on CLI entry for unix-like invocation", () => {
    const src = readFileSync(join(repoRoot, "src", "cli.ts"), "utf8");
    expect(src.startsWith("#!/usr/bin/env node")).toBe(true);
    if (existsSync(cli)) {
      expect(readFileSync(cli, "utf8").startsWith("#!/usr/bin/env node")).toBe(true);
    }
  });

  it("simulates network failure path with nonzero add exit via mocked host rejection", () => {
    if (!existsSync(cli)) return;
    const cwd = makeTempDir();
    seedProject(cwd);
    const init = spawnSync(process.execPath, [cli, "init", "--yes"], { cwd, encoding: "utf8" });
    expect(init.status).toBe(0);
    const add = spawnSync(process.execPath, [cli, "add", "https://example.com/a/b"], {
      cwd,
      encoding: "utf8",
    });
    expect(add.status).not.toBe(0);
    expect(add.stderr + add.stdout).toMatch(/UNSUPPORTED_HOST|Unsupported host/i);
  });
});

describe("agent adapter format compatibility", () => {
  it("Cursor rule starts with frontmatter and alwaysApply", () => {
    const content = getAdapter("cursor").preview(makeTempDir());
    assertCursorRuleFormat(content);
    expect(content.startsWith("---")).toBe(true);
    expect(content.indexOf("---")).toBe(0);
    expect(content).toContain("alwaysApply: true");
    expect(content.includes("<!-- OMNISKILL:BEGIN -->")).toBe(false);
  });

  it("Cursor install writes dedicated .mdc without leading HTML markers", () => {
    const root = makeTempDir();
    seedProject(root);
    ensureOmniDirs(root);
    const result = getAdapter("cursor").install(root);
    expect("action" in result && result.action).toBe("created");
    const dest = join(root, ".cursor", "rules", "omniskill.mdc");
    const text = readFileSync(dest, "utf8");
    assertCursorRuleFormat(text);
    // Idempotent
    const second = getAdapter("cursor").install(root);
    expect("action" in second && second.action).toBe("unchanged");
  });

  it("Claude adapter uses markers and supports rollback", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const dest = join(root, "CLAUDE.md");
    writeFileSync(dest, "# User\n", "utf8");
    const first = getAdapter("claude-code").install(root) as {
      action: string;
      backupPath?: string;
      destination: string;
    };
    expect(first.action).toBe("updated");
    expect(first.backupPath).toBeTruthy();
    expect(readFileSync(dest, "utf8")).toContain(BEGIN_MARKER);
    expect(readFileSync(dest, "utf8")).toContain("# User");
    rollbackFromBackup(dest, first.backupPath!);
    expect(readFileSync(dest, "utf8")).toBe("# User\n");
  });

  it("capability matrix is honest about unsupported skill installation", () => {
    for (const adapter of listAdapters()) {
      const skillInstall = adapter.capabilities.find((c) => c.capability === "skill-installation");
      expect(skillInstall?.supported).toBe(false);
      if (adapter.id === "portable") {
        expect(adapter.native).toBe(false);
      }
    }
  });

  it("portable install does not claim native integration", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const result = getAdapter("portable").install(root);
    expect(result).toMatchObject({ action: "exported" });
    expect(getAdapter("portable").native).toBe(false);
  });
});
