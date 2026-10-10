import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, beforeAll } from "vitest";
import { makeTempDir, seedProject } from "../helpers/temp.js";

const repoRoot = join(import.meta.dirname, "..", "..");
const cli = join(repoRoot, "dist", "cli.js");

function run(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("CLI matrix", () => {
  beforeAll(() => {
    if (!existsSync(cli)) {
      throw new Error("dist/cli.js missing — run npm run build first");
    }
  });

  it("help lists every required command", () => {
    const res = run(repoRoot, ["--help"]);
    expect(res.status).toBe(0);
    for (const cmd of [
      "init",
      "scan",
      "add",
      "sync",
      "list",
      "match",
      "export",
      "log",
      "feedback",
      "doctor",
      "classify",
      "discover",
      "plan",
      "context",
      "capabilities",
      "approve",
      "search",
      "tools",
      "run",
      "artifacts",
    ]) {
      expect(res.stdout).toContain(cmd);
    }
  });

  it("version prints semver and exits 0", () => {
    const res = run(repoRoot, ["--version"]);
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe("0.1.0");
  });

  it("rejects invalid agent on init", () => {
    const cwd = makeTempDir();
    seedProject(cwd);
    const res = run(cwd, ["init", "--agent", "chatgpt", "--yes"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/AGENT_INVALID|Invalid agent/i);
  });

  it("init --dry-run does not write CLAUDE.md", () => {
    const cwd = makeTempDir();
    seedProject(cwd, {
      packageJson: {
        name: "dry",
        dependencies: { next: "14.0.0", react: "18.0.0" },
      },
    });
    const res = run(cwd, ["init", "--dry-run", "--json"]);
    expect(res.status).toBe(0);
    expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(cwd, ".omni", "profile.json"))).toBe(true);
  });

  it("init --agent cursor writes cursor rule with --yes", () => {
    const cwd = makeTempDir();
    seedProject(cwd);
    const res = run(cwd, ["init", "--agent", "cursor", "--yes", "--json"]);
    expect(res.status).toBe(0);
    expect(existsSync(join(cwd, ".cursor", "rules", "omniskill.mdc"))).toBe(true);
  });

  it("list --domain filters and match/export json schemas are stable", () => {
    const cwd = makeTempDir();
    seedProject(cwd, {
      packageJson: {
        name: "app",
        dependencies: { next: "14.0.0", react: "18.0.0" },
        devDependencies: { vitest: "3.0.0", typescript: "5.0.0" },
      },
      files: { "tsconfig.json": "{}" },
    });
    expect(run(cwd, ["init", "--yes"]).status).toBe(0);

    const listAll = run(cwd, ["list", "--json"]);
    expect(listAll.status).toBe(0);
    const all = JSON.parse(listAll.stdout) as { skills: Array<{ domains: string[] }> };
    expect(all.skills.length).toBeGreaterThan(0);

    const listDomain = run(cwd, ["list", "--domain", "frontend", "--json"]);
    expect(listDomain.status).toBe(0);
    const filtered = JSON.parse(listDomain.stdout) as { skills: Array<{ domains: string[] }> };
    expect(filtered.skills.every((s) => s.domains.map((d) => d.toLowerCase()).includes("frontend"))).toBe(
      true,
    );

    const match = run(cwd, ["match", "Build a dark mode toggle", "--limit", "2", "--json"]);
    expect(match.status).toBe(0);
    const matchJson = JSON.parse(match.stdout) as {
      selected: unknown[];
      threshold: number;
      task: string;
    };
    expect(matchJson.task).toContain("dark mode");
    expect(matchJson.selected.length).toBeLessThanOrEqual(2);

    const exported = run(cwd, ["export", "Build a dark mode toggle", "--agent", "portable", "--json"]);
    expect(exported.status).toBe(0);
    const exportJson = JSON.parse(exported.stdout) as { path: string; skillIds: string[] };
    expect(existsSync(exportJson.path)).toBe(true);
    expect(readFileSync(exportJson.path, "utf8")).toContain("OmniSkill security policy");
  });

  it("doctor fails on corrupt registry", () => {
    const cwd = makeTempDir();
    seedProject(cwd);
    expect(run(cwd, ["init", "--yes"]).status).toBe(0);
    writeFileSync(join(cwd, ".omni", "skill-registry.json"), "{nope", "utf8");
    const res = run(cwd, ["doctor", "--json"]);
    expect(res.status).toBe(1);
    const json = JSON.parse(res.stdout) as { failed: number; checks: Array<{ id: string; status: string }> };
    expect(json.failed).toBeGreaterThan(0);
    expect(json.checks.some((c) => c.id === "registry" && c.status === "FAIL")).toBe(true);
  });

  it("add rejects malformed repo identifiers with nonzero exit", () => {
    const cwd = makeTempDir();
    seedProject(cwd);
    expect(run(cwd, ["init", "--yes"]).status).toBe(0);
    const res = run(cwd, ["add", "not a repo!!!"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/REPO_INVALID|Malformed/i);
  });

  it("sync without sources filter on empty custom source fails clearly", () => {
    const cwd = makeTempDir();
    seedProject(cwd);
    expect(run(cwd, ["init", "--yes"]).status).toBe(0);
    const res = run(cwd, ["sync", "--source", "does-not-exist", "--json"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/SOURCE_NOT_FOUND/i);
  });

  it("feedback and log json modes work after match", () => {
    const cwd = makeTempDir();
    seedProject(cwd);
    expect(run(cwd, ["init", "--yes"]).status).toBe(0);
    expect(run(cwd, ["match", "authentication login", "--json"]).status).toBe(0);
    const fb = run(cwd, [
      "feedback",
      "--skills",
      "seed__security-auth",
      "--no-relevant",
      "--no-helpful",
      "--json",
    ]);
    expect(fb.status).toBe(0);
    const log = run(cwd, ["log", "--last", "2", "--json"]);
    expect(log.status).toBe(0);
    const logJson = JSON.parse(log.stdout) as { events: unknown[]; stats: Record<string, unknown> };
    expect(logJson.events.length).toBeGreaterThan(0);
    expect(logJson.stats.totalEvents).toBeGreaterThan(0);
  });

  it("scan without init exits nonzero", () => {
    const cwd = makeTempDir();
    mkdirSync(cwd, { recursive: true });
    const res = run(cwd, ["scan"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/NOT_INITIALIZED/i);
  });
});
