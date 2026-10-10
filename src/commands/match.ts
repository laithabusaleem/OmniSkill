import { classificationPreferDomains, classifyTask } from "../core/classifier.js";
import { loadConfig, requireOmniInitialized } from "../core/config.js";
import { printJson, printLines, summarizeTask } from "../core/io.js";
import { appendLog } from "../core/logger.js";
import { matchSkills } from "../core/matcher.js";
import { loadRegistry } from "../core/registry.js";
import { loadProfile } from "../core/scanner.js";

export async function runMatch(options: {
  cwd: string;
  task: string;
  all?: boolean;
  limit?: number;
  json?: boolean;
  explain?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const config = loadConfig(options.cwd);
  const registry = loadRegistry(options.cwd);
  const profile = loadProfile(options.cwd);
  const classification = config.orchestration.autoClassifyOnMatch
    ? classifyTask(options.task, profile)
    : null;
  const result = matchSkills(options.task, profile, registry, config, {
    includeAll: options.all,
    maxSkills: options.limit ?? config.matching.maxSkills,
    preferences: classification
      ? { preferDomains: classificationPreferDomains(classification) }
      : undefined,
  });

  appendLog(options.cwd, {
    timestamp: new Date().toISOString(),
    type: "match",
    taskSummary: summarizeTask(options.task, config.privacy.logRawTask),
    selectedSkills: result.selected.map((s) => s.skillId),
    outcome: result.selected.length ? "unverified" : "blocked",
    meta: { candidateCount: result.candidates.length, threshold: result.threshold },
  });

  if (options.json) {
    printJson(result);
    return 0;
  }

  const lines: string[] = [];
  lines.push(`Task: ${options.task}`);
  lines.push(`Threshold: ${result.threshold}`);
  if (result.warnings.length) {
    lines.push(...result.warnings.map((w) => `Warning: ${w}`));
  }
  lines.push("");
  lines.push(options.all ? "All candidates:" : "Selected skills:");
  const list = options.all ? result.candidates : result.selected;
  if (list.length === 0) {
    lines.push("(none)");
  }
  for (const c of list) {
    lines.push(`- ${c.name} (${c.skillId}) score=${c.score} available=${c.available}`);
    for (const r of c.reasons) lines.push(`    reason: ${r}`);
    for (const w of c.warnings) lines.push(`    warn: ${w}`);
    if (options.explain) {
      for (const f of c.factors) {
        lines.push(`    factor ${f.name}=${f.score} (${f.detail})`);
      }
    }
  }
  printLines(lines);
  return 0;
}
