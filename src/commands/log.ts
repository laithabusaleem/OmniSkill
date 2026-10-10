import { requireOmniInitialized } from "../core/config.js";
import { printJson, printLines } from "../core/io.js";
import { readLog, summarizeLog } from "../core/logger.js";

export async function runLog(options: {
  cwd: string;
  last?: number;
  json?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const { events, corruptLines } = readLog(options.cwd);
  const last = options.last ?? 20;
  const slice = events.slice(-last);
  const stats = summarizeLog(events);

  if (options.json) {
    printJson({ events: slice, stats, corruptLines });
  } else {
    printLines([
      `Events: ${events.length} (showing last ${slice.length})`,
      `Corrupt lines skipped: ${corruptLines}`,
      `Stats: ${JSON.stringify(stats)}`,
      "",
      ...slice.map(
        (e) =>
          `${e.timestamp} ${e.type} outcome=${e.outcome ?? "-"} skills=${(e.selectedSkills ?? []).join(",") || "-"} ${e.taskSummary ?? ""}`,
      ),
    ]);
  }
  return 0;
}
