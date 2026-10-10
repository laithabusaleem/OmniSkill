import type { AgentKind } from "../core/agent-adapters.js";
import { buildBundle } from "../core/bundle-builder.js";
import { loadConfig, requireOmniInitialized } from "../core/config.js";
import { printJson, printLines, summarizeTask } from "../core/io.js";
import { appendLog } from "../core/logger.js";
import { matchSkills } from "../core/matcher.js";
import { loadRegistry } from "../core/registry.js";
import { loadProfile } from "../core/scanner.js";

export async function runExport(options: {
  cwd: string;
  task: string;
  agent?: AgentKind;
  json?: boolean;
  noAttribution?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const config = loadConfig(options.cwd);
  const agent = options.agent ?? config.agent;
  const registry = loadRegistry(options.cwd);
  const profile = loadProfile(options.cwd);
  const match = matchSkills(options.task, profile, registry, config);
  const attributionEnabled = options.noAttribution ? false : config.attribution.enabled;
  const bundle = buildBundle({
    projectRoot: options.cwd,
    task: options.task,
    profile,
    registry,
    match,
    config,
    bundleOptions: {
      maxChars: config.bundle.maxChars,
      agent,
      attributionEnabled,
    },
  });

  appendLog(options.cwd, {
    timestamp: new Date().toISOString(),
    type: "export",
    taskSummary: summarizeTask(options.task, config.privacy.logRawTask),
    selectedSkills: bundle.skillIds,
    integration: agent,
    outcome: "unverified",
    meta: {
      path: bundle.path,
      truncated: bundle.truncated,
      attribution: Boolean(bundle.attributionFooter),
    },
  });

  if (options.json) {
    printJson({
      path: bundle.path,
      skillIds: bundle.skillIds,
      truncated: bundle.truncated,
      warnings: bundle.warnings,
      attributionFooter: bundle.attributionFooter,
      match,
    });
  } else {
    printLines([
      `Bundle written: ${bundle.path}`,
      `Skills: ${bundle.skillIds.join(", ") || "(none)"}`,
      ...(bundle.attributionFooter ? [`Attribution: ${bundle.attributionFooter}`] : ["Attribution: disabled"]),
      ...bundle.warnings.map((w) => `Warning: ${w}`),
      "User documents were not overwritten. Third-party skill cache files were not modified.",
    ]);
  }
  return 0;
}
