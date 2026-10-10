import { requireOmniInitialized } from "../core/config.js";
import { printJson, printLines } from "../core/io.js";
import { discoverCapabilities } from "../platform/discovery/orchestrate.js";
import {
  ensureCapabilityRegistry,
  saveCapabilityRegistry,
  upsertCapability,
} from "../platform/capability-registry.js";

export async function runPlatformDiscover(options: {
  cwd: string;
  task: string;
  offline?: boolean;
  importLocal?: boolean;
  json?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const result = await discoverCapabilities(options.cwd, options.task, {
    offline: options.offline,
    allowSideEffects: options.importLocal,
  });

  let doc = ensureCapabilityRegistry(options.cwd);
  for (const c of result.candidates.filter((x) => x.decision === "select" || x.decision === "review")) {
    doc = upsertCapability(doc, c.capability);
  }
  saveCapabilityRegistry(options.cwd, doc);

  if (options.json) {
    printJson(result);
    return 0;
  }

  printLines([
    "Universal capability discovery",
    `Coverage: ${result.coverage}`,
    "",
    "Candidates:",
    ...result.candidates.slice(0, 20).map(
      (c) =>
        `- [${c.decision}] (${c.capability.kind}) ${c.capability.name} score=${c.score} status=${c.capability.status}`,
    ),
    "",
    "Uncertainty:",
    ...result.uncertainty.map((u) => `- ${u}`),
    "",
    `Providers: ${result.providersUsed.join(", ")}`,
  ]);
  return 0;
}
