import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { LogEvent } from "../types/index.js";
import { paths } from "./config.js";
import { redactSecrets } from "./security.js";

export function appendLog(projectRoot: string, event: LogEvent): void {
  const file = paths(projectRoot).log;
  const safe: LogEvent = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
    taskSummary: event.taskSummary ? redactSecrets(event.taskSummary).slice(0, 200) : undefined,
    failureReasons: event.failureReasons?.map((r) => redactSecrets(r).slice(0, 200)),
    feedback: event.feedback
      ? {
          ...event.feedback,
          notes: event.feedback.notes ? redactSecrets(event.feedback.notes).slice(0, 500) : undefined,
        }
      : undefined,
  };
  appendFileSync(file, `${JSON.stringify(safe)}\n`, "utf8");
}

export function readLog(projectRoot: string): { events: LogEvent[]; corruptLines: number } {
  const file = paths(projectRoot).log;
  if (!existsSync(file)) return { events: [], corruptLines: 0 };
  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const events: LogEvent[] = [];
  let corruptLines = 0;
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as LogEvent);
    } catch {
      corruptLines += 1;
    }
  }
  return { events, corruptLines };
}

export function summarizeLog(events: LogEvent[]): Record<string, number | string> {
  const outcomes: Record<string, number> = {};
  let feedbackCount = 0;
  let relevant = 0;
  let helpful = 0;
  for (const e of events) {
    if (e.outcome) outcomes[e.outcome] = (outcomes[e.outcome] ?? 0) + 1;
    if (e.feedback) {
      feedbackCount += 1;
      if (e.feedback.relevant) relevant += 1;
      if (e.feedback.helpful) helpful += 1;
    }
  }
  const verified = outcomes.verified ?? 0;
  const attempted = (outcomes.attempted ?? 0) + verified + (outcomes.failed ?? 0) + (outcomes.unverified ?? 0);
  return {
    totalEvents: events.length,
    ...outcomes,
    feedbackCount,
    relevantFeedback: relevant,
    helpfulFeedback: helpful,
    // Only report a rate when we have a meaningful verified denominator
    verifiedAmongTerminal:
      attempted > 0 && verified > 0 ? `${verified}/${attempted} events marked verified (not a success rate guarantee)` : "n/a",
  };
}

export function rewriteLogRecovered(projectRoot: string, events: LogEvent[]): void {
  const file = paths(projectRoot).log;
  writeFileSync(file, events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : ""), "utf8");
}
