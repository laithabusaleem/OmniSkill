import { classifyTask } from "../core/classifier.js";
import { requireOmniInitialized, loadConfig } from "../core/config.js";
import { printJson, printLines, summarizeTask } from "../core/io.js";
import { appendLog } from "../core/logger.js";
import { loadProfile } from "../core/scanner.js";

export async function runClassify(options: {
  cwd: string;
  task: string;
  json?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const config = loadConfig(options.cwd);
  const profile = loadProfile(options.cwd);
  const result = classifyTask(options.task, profile);

  appendLog(options.cwd, {
    timestamp: new Date().toISOString(),
    type: "classify",
    taskSummary: summarizeTask(options.task, config.privacy.logRawTask),
    outcome: "unverified",
    meta: {
      primaryDomain: result.primaryDomain,
      confidence: result.confidence,
    },
  });

  if (options.json) {
    printJson(result);
    return 0;
  }

  printLines([
    `Primary domain: ${result.primaryDomain}`,
    `Secondary: ${result.secondaryDomains.join(", ") || "none"}`,
    `Outcome: ${result.desiredOutcome}`,
    `Deliverables: ${result.deliverables.join("; ")}`,
    `Formats: ${result.outputFormats.join(", ")}`,
    `Capabilities needed: ${result.requiredCapabilities.join(", ")}`,
    `Confidence: ${result.confidence} (heuristic)`,
    `Needs clarification: ${result.needsClarification}`,
    ...result.clarificationQuestions.map((q) => `  ? ${q}`),
    "",
    "Reasons:",
    ...result.reasons.map((r) => `- ${r}`),
    "",
    "Note: classification is deterministic and local — not model proof.",
  ]);
  return 0;
}
