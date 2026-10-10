import { describe, expect, it } from "vitest";
import { runAdd } from "../../src/commands/add.js";
import { runDoctorCommand } from "../../src/commands/doctor.js";
import { runExport } from "../../src/commands/export.js";
import { runList } from "../../src/commands/list.js";
import { runLog } from "../../src/commands/log.js";
import { runMatch } from "../../src/commands/match.js";
import { runScan } from "../../src/commands/scan.js";
import { runSync } from "../../src/commands/sync.js";
import { runInit } from "../../src/commands/init.js";
import { defaultConfig } from "../../src/core/config.js";
import { githubSkillFixture } from "../helpers/mock-fetch.js";
import { makeTempDir, seedProject } from "../helpers/temp.js";

async function silence<T>(fn: () => Promise<T>): Promise<T> {
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    return await fn();
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
}

describe("command runners (direct)", () => {
  it("scan/list/match/export/log/doctor after init", async () => {
    const cwd = makeTempDir();
    seedProject(cwd, {
      packageJson: {
        name: "cmd",
        dependencies: { next: "14.0.0", react: "18.0.0" },
        devDependencies: { vitest: "3.0.0", typescript: "5.0.0" },
      },
      files: { "tsconfig.json": "{}" },
    });
    await silence(() => runInit({ cwd, yes: true, json: true }));
    expect(await silence(() => runScan({ cwd, json: true }))).toBe(0);
    expect(await silence(() => runList({ cwd, domain: "frontend", json: true }))).toBe(0);
    expect(await silence(() => runMatch({ cwd, task: "dark mode toggle", explain: true, json: true }))).toBe(0);
    expect(await silence(() => runExport({ cwd, task: "dark mode toggle", agent: "portable", json: true }))).toBe(0);
    expect(await silence(() => runLog({ cwd, last: 3, json: true }))).toBe(0);
    expect(await silence(() => runDoctorCommand({ cwd, json: true }))).toBe(0);
  });

  it("add and sync with mocked GitHub", async () => {
    const cwd = makeTempDir();
    seedProject(cwd);
    await silence(() => runInit({ cwd, yes: true, json: true }));

    const skill = `---
name: live-demo
description: Demo
domains: [frontend]
stacks: [react]
triggers: [widget]
---
# Hi
`;
    const fetchImpl = githubSkillFixture({
      owner: "acme",
      repo: "skills",
      skills: [{ path: "demo/SKILL.md", content: skill }],
    });

    // Patch global fetch used by command → sync → fetcher when no inject; use addRepository path via env isn't available.
    // Instead call runAdd after temporarily stubbing global fetch.
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      expect(await silence(() => runAdd({ cwd, repo: "acme/skills", json: true }))).toBe(0);
      expect(await silence(() => runSync({ cwd, source: "acme__skills", json: true }))).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
    expect(defaultConfig().matching.maxSkills).toBe(5);
  });

  it("sync unknown source fails", async () => {
    const cwd = makeTempDir();
    seedProject(cwd);
    await silence(() => runInit({ cwd, yes: true, json: true }));
    await expect(silence(() => runSync({ cwd, source: "missing", json: true }))).rejects.toMatchObject({
      code: "SOURCE_NOT_FOUND",
    });
  });
});
