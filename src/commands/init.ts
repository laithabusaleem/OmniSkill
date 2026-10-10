import { existsSync } from "node:fs";
import { getAdapter, type AgentKind } from "../core/agent-adapters.js";
import {
  defaultConfig,
  ensureOmniDirs,
  loadConfig,
  paths,
  saveConfig,
} from "../core/config.js";
import { cliIdentityLine } from "../core/branding.js";
import { printJson, printLines } from "../core/io.js";
import { appendLog } from "../core/logger.js";
import { createSeededRegistry, saveRegistry } from "../core/registry.js";
import { scanProject, writeProfile } from "../core/scanner.js";

export interface InitOptions {
  cwd: string;
  agent?: AgentKind;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export async function runInit(options: InitOptions): Promise<number> {
  const cwd = options.cwd;
  ensureOmniDirs(cwd);

  const config = existsSync(paths(cwd).config) ? loadConfig(cwd) : defaultConfig();
  if (options.agent) config.agent = options.agent;
  saveConfig(cwd, config);

  const profile = scanProject(cwd);
  writeProfile(cwd, profile);

  const registryPath = paths(cwd).registry;
  const seeded = !existsSync(registryPath);
  if (seeded) {
    saveRegistry(cwd, createSeededRegistry());
  }

  const adapter = getAdapter(config.agent);
  const preview = adapter.preview(cwd);
  const shouldWriteInstructions = Boolean(options.yes || options.dryRun);

  let installResult:
    | ReturnType<typeof adapter.install>
    | { action: "skipped"; reason: string }
    | undefined;

  if (!shouldWriteInstructions) {
    installResult = {
      action: "skipped",
      reason: "Pass --yes to install agent instructions, or --dry-run to preview without writing.",
    };
  } else {
    installResult = adapter.install(cwd, { dryRun: options.dryRun });
  }

  const verification = ["profile-written", "dirs-created"];
  if (seeded) verification.push("registry-seeded");
  if (options.yes && !options.dryRun) verification.push("instructions-installed");
  if (options.dryRun) verification.push("instructions-previewed");

  appendLog(cwd, {
    timestamp: new Date().toISOString(),
    type: "init",
    integration: config.agent,
    outcome: options.yes && !options.dryRun ? "verified" : "attempted",
    verification,
    meta: { agent: config.agent, installAction: "action" in installResult ? String(installResult.action) : "unknown" },
  });

  const payload = {
    ok: true,
    profilePath: paths(cwd).profile,
    registryPath: paths(cwd).registry,
    languages: profile.languages,
    frameworks: profile.frameworks,
    agent: config.agent,
    install: installResult,
    previewExcerpt: preview.slice(0, 400),
    note: shouldWriteInstructions
      ? "Reload or restart your coding agent if it caches project instructions."
      : "Project initialized. Re-run with --yes to install agent instructions after reviewing the preview.",
  };

  if (options.json) {
    printJson(payload);
  } else {
    printLines([
      cliIdentityLine(),
      "OmniSkill initialized.",
      `Profile: ${payload.profilePath}`,
      `Registry: ${payload.registryPath}`,
      `Detected languages: ${profile.languages.join(", ") || "none"}`,
      `Detected frameworks: ${profile.frameworks.join(", ") || "none"}`,
      `Agent integration: ${config.agent} (${"action" in installResult ? installResult.action : "done"})`,
      payload.note,
      "",
      "Preview (first 400 chars):",
      preview.slice(0, 400),
    ]);
  }
  return 0;
}
