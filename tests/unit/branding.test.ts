import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runExport } from "../../src/commands/export.js";
import { runInit } from "../../src/commands/init.js";
import {
  colorsEnabled,
  formatAttributionFooter,
  normalizeRepositoryUrl,
  resolveRepositoryUrl,
  cliIdentityLine,
} from "../../src/core/branding.js";
import { buildBundle } from "../../src/core/bundle-builder.js";
import { writeCachedSkill, writeCacheMeta } from "../../src/core/cache.js";
import { defaultConfig, ensureOmniDirs, saveConfig } from "../../src/core/config.js";
import { contentHash } from "../../src/core/security.js";
import { matchSkills } from "../../src/core/matcher.js";
import type { SkillRegistry } from "../../src/types/index.js";
import { makeTempDir, seedProject } from "../helpers/temp.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(repoRoot, "dist", "cli.js");

async function silence<T>(fn: () => Promise<T>): Promise<T> {
  const out = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await fn();
  } finally {
    process.stdout.write = out;
  }
}

describe("branding and attribution", () => {
  it("never invents a repository URL", () => {
    expect(normalizeRepositoryUrl("")).toBeUndefined();
    expect(normalizeRepositoryUrl("not-a-url")).toBeUndefined();
    expect(normalizeRepositoryUrl("http://github.com/a/b")).toBeUndefined();
    expect(normalizeRepositoryUrl("https://github.com/acme/omniskill.git")).toBe(
      "https://github.com/acme/omniskill",
    );
    const cfg = defaultConfig();
    delete process.env.OMNISKILL_REPO_URL;
    const url = resolveRepositoryUrl(cfg, {});
    expect(url).toBeUndefined();
    expect(formatAttributionFooter(cfg, { repositoryUrl: undefined })).toBe(
      "Generated with OmniSkill",
    );
    // Explicit empty package meta — never invent OWNER/REPO
    expect(resolveRepositoryUrl(defaultConfig(), { name: "omniskill" })).toBeUndefined();
  });

  it("uses configured repository URL when known", () => {
    const cfg = defaultConfig();
    cfg.attribution.repositoryUrl = "https://github.com/example/omniskill";
    expect(formatAttributionFooter(cfg)).toBe(
      "Generated with OmniSkill · https://github.com/example/omniskill",
    );
  });

  it("formatAttributionFooter respects disabled and custom text", () => {
    const cfg = defaultConfig();
    cfg.attribution.enabled = false;
    expect(formatAttributionFooter(cfg)).toBeNull();
    cfg.attribution.enabled = true;
    cfg.attribution.footerText = "Custom footer";
    expect(formatAttributionFooter(cfg)).toBe("Custom footer");
    expect(formatAttributionFooter(cfg, { enabled: false })).toBeNull();
  });

  it("bundle includes provenance and footer by default; --no-attribution omits footer", async () => {
    const root = makeTempDir();
    seedProject(root);
    await silence(() => runInit({ cwd: root, yes: true, json: true }));

    const skillBody = `---
name: demo
description: demo
---
Body
`;
    writeCachedSkill(root, "seed__frontend-ui", skillBody);
    writeCacheMeta(root, "seed__frontend-ui", {
      sourceId: "anthropics__skills",
      path: "seed/frontend-ui/SKILL.md",
      contentHash: contentHash(skillBody),
      syncedAt: new Date().toISOString(),
    });

    const withAttr = await silence(() =>
      runExport({ cwd: root, task: "dark mode toggle", agent: "portable", json: true }),
    );
    expect(withAttr).toBe(0);

    const cfg = defaultConfig();
    const registry = JSON.parse(
      readFileSync(join(root, ".omni", "skill-registry.json"), "utf8"),
    ) as SkillRegistry;
    registry.skills = registry.skills.map((s) =>
      s.id === "seed__frontend-ui" ? { ...s, cacheStatus: "cached" as const } : s,
    );
    const match = matchSkills("dark mode toggle", null, registry, cfg);
    const bundled = buildBundle({
      projectRoot: root,
      task: "dark mode toggle",
      profile: null,
      registry,
      match,
      config: cfg,
      bundleOptions: { maxChars: 48_000, agent: "portable" },
    });
    expect(bundled.markdown).toContain("## Provenance");
    expect(bundled.markdown).toContain("third-party");
    expect(bundled.attributionFooter).toBe("Generated with OmniSkill");
    expect(bundled.markdown).toContain("Generated with OmniSkill");

    const noAttr = buildBundle({
      projectRoot: root,
      task: "dark mode toggle",
      profile: null,
      registry,
      match,
      config: cfg,
      bundleOptions: { maxChars: 48_000, agent: "portable", attributionEnabled: false },
    });
    expect(noAttr.attributionFooter).toBeNull();
    expect(noAttr.markdown).not.toContain("Generated with OmniSkill ·");
    expect(noAttr.markdown.endsWith("Generated with OmniSkill\n")).toBe(false);
  });

  it("does not modify cached third-party skill files when exporting", async () => {
    const root = makeTempDir();
    seedProject(root);
    await silence(() => runInit({ cwd: root, yes: true, json: true }));
    const skillPath = join(root, ".omni", "skills", "seed__frontend-ui", "SKILL.md");
    mkdirSync(join(root, ".omni", "skills", "seed__frontend-ui"), { recursive: true });
    const original = "---\nname: x\ndescription: y\n---\nORIGINAL\n";
    writeFileSync(skillPath, original, "utf8");
    writeCacheMeta(root, "seed__frontend-ui", {
      sourceId: "anthropics__skills",
      path: "seed/frontend-ui/SKILL.md",
      contentHash: contentHash(original),
      syncedAt: new Date().toISOString(),
    });
    await silence(() => runExport({ cwd: root, task: "dark mode", json: true }));
    expect(readFileSync(skillPath, "utf8")).toBe(original);
  });

  it("preserves user CLAUDE.md content outside managed block", async () => {
    const root = makeTempDir();
    seedProject(root);
    writeFileSync(join(root, "CLAUDE.md"), "# Keep me\n", "utf8");
    await silence(() => runInit({ cwd: root, yes: true, json: true }));
    const text = readFileSync(join(root, "CLAUDE.md"), "utf8");
    expect(text.startsWith("# Keep me\n")).toBe(true);
    expect(text).toContain("Managed by OmniSkill");
  });

  it("help shows identity line; json init does not print banners", () => {
    if (!existsSync(cli)) throw new Error("build required");
    const help = spawnSync(process.execPath, [cli, "--help"], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("OmniSkill");
    expect(help.stdout).toContain("Project-aware AI skill router");

    const cwd = makeTempDir();
    seedProject(cwd);
    const init = spawnSync(process.execPath, [cli, "init", "--yes", "--json"], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    expect(init.status).toBe(0);
    expect(init.stdout.trim().startsWith("{")).toBe(true);
    expect(init.stdout).not.toContain("────");
  });

  it("NO_COLOR disables ANSI in identity helper", () => {
    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = "1";
    try {
      expect(colorsEnabled()).toBe(false);
      expect(cliIdentityLine("0.1.0")).not.toMatch(/\u001b\[/);
    } finally {
      if (prev === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = prev;
    }
  });

  it("export --no-attribution works via CLI", () => {
    if (!existsSync(cli)) throw new Error("build required");
    const cwd = makeTempDir();
    seedProject(cwd);
    expect(spawnSync(process.execPath, [cli, "init", "--yes"], { cwd, encoding: "utf8" }).status).toBe(0);
    const res = spawnSync(
      process.execPath,
      [cli, "export", "dark mode toggle", "--agent", "portable", "--no-attribution", "--json"],
      { cwd, encoding: "utf8" },
    );
    expect(res.status).toBe(0);
    const json = JSON.parse(res.stdout) as { attributionFooter: string | null; path: string };
    expect(json.attributionFooter).toBeNull();
    const body = readFileSync(json.path, "utf8");
    expect(body).toContain("## Provenance");
    expect(body).not.toMatch(/Generated with OmniSkill/);
  });

  it("brand assets exist and are valid SVG", () => {
    const mark = readFileSync(join(repoRoot, "assets", "branding", "omniskill-mark.svg"), "utf8");
    const logo = readFileSync(join(repoRoot, "assets", "branding", "omniskill-logo.svg"), "utf8");
    expect(mark).toContain("<svg");
    expect(mark).toContain("<title");
    expect(logo).toContain("OmniSkill");
    expect(existsSync(join(repoRoot, "assets", "branding", "BRAND.md"))).toBe(true);
  });

  it("saveConfig round-trips attribution settings", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const cfg = defaultConfig();
    cfg.attribution.enabled = false;
    cfg.attribution.repositoryUrl = "https://github.com/acme/omniskill";
    saveConfig(root, cfg);
    const loaded = JSON.parse(readFileSync(join(root, ".omni", "config.json"), "utf8")) as {
      attribution: { enabled: boolean; repositoryUrl?: string };
    };
    expect(loaded.attribution.enabled).toBe(false);
    expect(loaded.attribution.repositoryUrl).toBe("https://github.com/acme/omniskill");
  });
});
