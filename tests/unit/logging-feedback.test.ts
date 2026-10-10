import { describe, expect, it } from "vitest";
import { ensureOmniDirs } from "../../src/core/config.js";
import { recommendRegistryChanges, recordFeedback } from "../../src/core/feedback-engine.js";
import { appendLog, readLog, summarizeLog } from "../../src/core/logger.js";
import { loadSeedRegistry } from "../../src/core/registry.js";
import { runFeedback } from "../../src/commands/feedback.js";
import { makeTempDir } from "../helpers/temp.js";

describe("logging and feedback", () => {
  it("privacy defaults redact tokens in task summaries", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    appendLog(root, {
      timestamp: new Date().toISOString(),
      type: "match",
      taskSummary: "use ghp_abcdefghijklmnopqrstuv token",
      outcome: "unverified",
    });
    const { events } = readLog(root);
    expect(events[0]!.taskSummary).toContain("[REDACTED");
    expect(events[0]!.taskSummary).not.toContain("ghp_abcdefghijklmnopqrstuv");
  });

  it("summarizeLog does not invent success rates without verified outcomes", () => {
    const stats = summarizeLog([
      { timestamp: "t", type: "match", outcome: "unverified" },
      { timestamp: "t", type: "match", outcome: "attempted" },
    ]);
    expect(stats.verifiedAmongTerminal).toBe("n/a");
  });

  it("insufficient feedback data only recommends review", () => {
    const registry = loadSeedRegistry();
    const id = registry.skills[0]!.id;
    const recs = recommendRegistryChanges(registry, [
      { skillIds: [id], relevant: true, helpful: true },
      { skillIds: [id], relevant: true, helpful: true },
    ]);
    expect(recs[0]!.action).toBe("review");
    expect(recs[0]!.rationale).toMatch(/insufficient/i);
  });

  it("recommends lower-priority after enough negative samples without applying changes", () => {
    const registry = loadSeedRegistry();
    const id = registry.skills[0]!.id;
    const feedback = Array.from({ length: 3 }, () => ({
      skillIds: [id],
      relevant: false,
      helpful: false,
    }));
    const beforePriority = registry.skills[0]!.priority;
    const recs = recommendRegistryChanges(registry, feedback);
    expect(recs.some((r) => r.action === "lower-priority")).toBe(true);
    expect(registry.skills[0]!.priority).toBe(beforePriority);
  });

  it("invalid feedback CLI without skills exits nonzero", async () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    const { saveRegistry, loadSeedRegistry: seed } = await import("../../src/core/registry.js");
    saveRegistry(root, seed());
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      const code = await runFeedback({ cwd: root });
      expect(code).toBe(1);
    } finally {
      process.stdout.write = original;
    }
  });

  it("recordFeedback appends structured event", () => {
    const root = makeTempDir();
    ensureOmniDirs(root);
    recordFeedback(root, {
      skillIds: ["seed__frontend-ui"],
      relevant: true,
      helpful: false,
      notes: "password=supersecret",
    });
    const { events } = readLog(root);
    expect(events.some((e) => e.type === "feedback")).toBe(true);
    const fb = events.find((e) => e.type === "feedback");
    expect(fb!.feedback?.notes).toContain("[REDACTED]");
  });

  it("empty log summarize is stable", () => {
    const stats = summarizeLog([]);
    expect(stats.totalEvents).toBe(0);
    expect(stats.feedbackCount).toBe(0);
  });
});
