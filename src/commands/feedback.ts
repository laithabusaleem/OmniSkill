import { requireOmniInitialized } from "../core/config.js";
import { recommendRegistryChanges, recordFeedback } from "../core/feedback-engine.js";
import { printJson, printLines } from "../core/io.js";
import { readLog } from "../core/logger.js";
import { loadRegistry } from "../core/registry.js";

export async function runFeedback(options: {
  cwd: string;
  skills?: string;
  relevant?: boolean;
  helpful?: boolean;
  notes?: string;
  taskSummary?: string;
  json?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);

  const skillIds = (options.skills ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (skillIds.length === 0) {
    printLines([
      "Usage: omniskill feedback --skills <id1,id2> --relevant/--no-relevant --helpful/--no-helpful [--notes ...]",
      "No registry changes are applied automatically.",
    ]);
    return 1;
  }

  const relevant = options.relevant ?? true;
  const helpful = options.helpful ?? true;

  recordFeedback(options.cwd, {
    skillIds,
    relevant,
    helpful,
    notes: options.notes,
    taskSummary: options.taskSummary,
  });

  const registry = loadRegistry(options.cwd);
  const { events } = readLog(options.cwd);
  const feedbackEvents = events
    .filter((e) => e.type === "feedback" && e.selectedSkills)
    .map((e) => ({
      skillIds: e.selectedSkills ?? [],
      relevant: e.feedback?.relevant,
      helpful: e.feedback?.helpful,
    }));
  const recommendations = recommendRegistryChanges(registry, feedbackEvents);

  if (options.json) {
    printJson({ ok: true, recorded: { skillIds, relevant, helpful }, recommendations });
  } else {
    printLines([
      "Feedback recorded.",
      `Skills: ${skillIds.join(", ")}`,
      `Relevant: ${relevant}; Helpful: ${helpful}`,
      "Recommendations (not applied):",
      ...recommendations.map((r) => `- ${r.skillId}: ${r.action} (${r.rationale})`),
    ]);
  }
  return 0;
}
