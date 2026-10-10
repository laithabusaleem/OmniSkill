import { loadConfig, requireOmniInitialized } from "../core/config.js";
import { printJson, printLines } from "../core/io.js";
import { loadRegistry, saveRegistry } from "../core/registry.js";
import { addRepository } from "../core/sync.js";
import { appendLog } from "../core/logger.js";

export async function runAdd(options: {
  cwd: string;
  repo: string;
  json?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const config = loadConfig(options.cwd);
  const registry = loadRegistry(options.cwd);
  const { registry: next, summary } = await addRepository(options.cwd, registry, options.repo, config);
  saveRegistry(options.cwd, next);

  appendLog(options.cwd, {
    timestamp: new Date().toISOString(),
    type: "add",
    outcome: summary.failed.length && summary.cached === 0 ? "failed" : "verified",
    meta: {
      sourceId: summary.sourceId,
      discovered: summary.discovered,
      cached: summary.cached,
      failed: summary.failed.length,
    },
  });

  if (options.json) {
    printJson({ ok: true, summary });
  } else {
    printLines([
      `Source: ${summary.sourceId}`,
      `Discovered SKILL.md files: ${summary.discovered}`,
      `Registered/cached: ${summary.cached}`,
      `Unchanged: ${summary.unchanged}`,
      `Failed: ${summary.failed.length}`,
      ...summary.failed.slice(0, 10).map((f) => `  - ${f.path}: ${f.error}`),
    ]);
  }
  return summary.discovered > 0 && summary.cached === 0 && summary.failed.length > 0 ? 1 : 0;
}
