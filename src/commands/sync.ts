import { loadConfig, requireOmniInitialized } from "../core/config.js";
import { printJson, printLines } from "../core/io.js";
import { appendLog } from "../core/logger.js";
import { loadRegistry, saveRegistry } from "../core/registry.js";
import { syncRegistry } from "../core/sync.js";

export async function runSync(options: {
  cwd: string;
  source?: string;
  json?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const config = loadConfig(options.cwd);
  const registry = loadRegistry(options.cwd);
  const { registry: next, summaries } = await syncRegistry(
    options.cwd,
    registry,
    config,
    options.source,
  );
  saveRegistry(options.cwd, next);

  const failed = summaries.reduce((n, s) => n + s.failed.length, 0);
  const cached = summaries.reduce((n, s) => n + s.cached, 0);

  appendLog(options.cwd, {
    timestamp: new Date().toISOString(),
    type: "sync",
    outcome: failed > 0 && cached === 0 ? "failed" : "verified",
    meta: { sources: summaries.length, cached, failed },
  });

  if (options.json) {
    printJson({ ok: true, summaries });
  } else {
    const lines = ["Sync complete:"];
    for (const s of summaries) {
      lines.push(
        `- ${s.sourceId}: discovered=${s.discovered} cached=${s.cached} unchanged=${s.unchanged} failed=${s.failed.length}`,
      );
    }
    printLines(lines);
  }
  return failed > 0 && cached === 0 ? 1 : 0;
}
