import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, expect, it, beforeAll } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const cli = join(repoRoot, "dist", "cli.js");

function run(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("CLI integration", () => {
  beforeAll(() => {
    if (!existsSync(cli)) {
      throw new Error("dist/cli.js missing — run npm run build before integration tests");
    }
  });

  it("shows help and version", () => {
    const help = run(repoRoot, ["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("init");
    const ver = run(repoRoot, ["--version"]);
    expect(ver.status).toBe(0);
    expect(ver.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
  });

  it("end-to-end init, scan, list, match, export, log, feedback, doctor", () => {
    const cwd = join(tmpdir(), `omniskill-e2e-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        name: "sample-next",
        dependencies: { next: "14.2.0", react: "18.2.0" },
        devDependencies: { typescript: "5.4.0", vitest: "3.0.0", tailwindcss: "3.4.0" },
      }),
    );
    writeFileSync(join(cwd, "tsconfig.json"), "{}");

    const init = run(cwd, ["init", "--yes", "--json"]);
    expect(init.status).toBe(0);
    expect(existsSync(join(cwd, ".omni", "profile.json"))).toBe(true);
    expect(existsSync(join(cwd, ".omni", "skill-registry.json"))).toBe(true);
    expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(true);
    expect(readFileSync(join(cwd, "CLAUDE.md"), "utf8")).toContain("OMNISKILL:BEGIN");

    const scan = run(cwd, ["scan", "--json"]);
    expect(scan.status).toBe(0);
    const profile = JSON.parse(scan.stdout) as { frameworks: string[] };
    expect(profile.frameworks).toContain("nextjs");

    const list = run(cwd, ["list", "--json"]);
    expect(list.status).toBe(0);

    const match = run(cwd, ["match", "Build a dark mode toggle", "--explain", "--json"]);
    expect(match.status).toBe(0);
    const matchJson = JSON.parse(match.stdout) as {
      selected: Array<{ name: string; score: number }>;
    };
    expect(matchJson.selected.length).toBeGreaterThan(0);
    expect(matchJson.selected.some((s) => /frontend|ui|testing|vitest/i.test(s.name))).toBe(true);

    const exported = run(cwd, ["export", "Build a dark mode toggle", "--agent", "portable", "--json"]);
    expect(exported.status).toBe(0);
    const exportJson = JSON.parse(exported.stdout) as { path: string };
    expect(existsSync(exportJson.path)).toBe(true);

    const log = run(cwd, ["log", "--last", "5", "--json"]);
    expect(log.status).toBe(0);

    const feedback = run(cwd, [
      "feedback",
      "--skills",
      "seed__frontend-ui",
      "--relevant",
      "--helpful",
      "--json",
    ]);
    expect(feedback.status).toBe(0);

    const doctor = run(cwd, ["doctor", "--json"]);
    expect(doctor.status).toBe(0);
    const doctorJson = JSON.parse(doctor.stdout) as { failed: number };
    expect(doctorJson.failed).toBe(0);
  });

  it("fails clearly when not initialized", () => {
    const cwd = join(tmpdir(), `omniskill-uninit-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    const res = run(cwd, ["list"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/not initialized|NOT_INITIALIZED/i);
  });
});
