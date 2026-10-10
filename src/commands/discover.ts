import { classificationPreferDomains, classifyTask } from "../core/classifier.js";
import { loadConfig, requireOmniInitialized } from "../core/config.js";
import { printJson, printLines, summarizeTask } from "../core/io.js";
import { discoverLocalSkills } from "../core/local-skills.js";
import { appendLog } from "../core/logger.js";
import { matchSkills } from "../core/matcher.js";
import { loadRegistry } from "../core/registry.js";
import { loadProfile } from "../core/scanner.js";
import { evaluateSkills } from "../core/skill-evaluator.js";

export async function runDiscover(options: {
  cwd: string;
  task: string;
  local?: boolean;
  json?: boolean;
  preview?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const config = loadConfig(options.cwd);
  let registry = loadRegistry(options.cwd);
  const profile = loadProfile(options.cwd);
  const classification = classifyTask(options.task, profile);

  let localResult = null;
  if (options.local || config.discovery.localSkillDirs.length) {
    const dirs = config.discovery.localSkillDirs.length
      ? config.discovery.localSkillDirs
      : options.local
        ? [".agents/skills", "skills", ".claude/skills"]
        : [];
    if (dirs.length) {
      const discovered = discoverLocalSkills(options.cwd, registry, dirs);
      registry = discovered.registry;
      localResult = discovered.result;
    }
  }

  const match = matchSkills(options.task, profile, registry, config, {
    includeAll: true,
    preferences: config.orchestration.autoClassifyOnMatch
      ? { preferDomains: classificationPreferDomains(classification) }
      : undefined,
  });

  const evaluations = evaluateSkills({
    projectRoot: options.cwd,
    registry,
    config,
    candidates: match.candidates,
    selectedIds: match.selected.map((s) => s.skillId),
    agent: config.agent,
  });

  appendLog(options.cwd, {
    timestamp: new Date().toISOString(),
    type: "discover",
    taskSummary: summarizeTask(options.task, config.privacy.logRawTask),
    selectedSkills: evaluations.filter((e) => e.decision === "select").map((e) => e.skillId),
    outcome: "unverified",
    meta: { primaryDomain: classification.primaryDomain, candidates: evaluations.length },
  });

  const payload = {
    classification,
    local: localResult,
    match: {
      threshold: match.threshold,
      selected: match.selected,
      warnings: match.warnings,
    },
    evaluations,
    note: "Scores are heuristics. Inspect provenance before install. Skills do not supply missing tools.",
  };

  if (options.json) {
    printJson(payload);
    return 0;
  }

  const lines: string[] = [
    `Domain: ${classification.primaryDomain}` +
      (classification.secondaryDomains.length ? ` (+ ${classification.secondaryDomains.join(", ")})` : ""),
    `Outcome: ${classification.desiredOutcome}`,
    "",
    "Evaluations:",
  ];
  for (const e of evaluations.slice(0, 15)) {
    lines.push(`- [${e.decision}] ${e.name} (${e.skillId}) kind=${e.kind} score=${e.score}`);
    if (options.preview && e.inspectExcerpt) {
      lines.push(`    excerpt: ${e.inspectExcerpt.slice(0, 160)}…`);
    }
    for (const w of e.warnings.slice(0, 3)) lines.push(`    warn: ${w}`);
  }
  if (localResult) {
    lines.push("", `Local discovery: registered=${localResult.registered}`);
    for (const w of localResult.warnings) lines.push(`  warn: ${w}`);
  }
  lines.push("", payload.note);
  printLines(lines);
  return 0;
}
