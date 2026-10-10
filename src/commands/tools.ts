import { requireOmniInitialized } from "../core/config.js";
import { printJson, printLines } from "../core/io.js";
import {
  ensureCapabilityRegistry,
  saveCapabilityRegistry,
  setCapabilityStatus,
  upsertCapability,
} from "../platform/capability-registry.js";
import { ensureBuiltinPlugins, listPlugins } from "../platform/plugins.js";
import type { AdapterContext } from "../platform/adapters/contracts.js";

export async function runTools(options: {
  cwd: string;
  probe?: boolean;
  json?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  ensureBuiltinPlugins();
  let doc = ensureCapabilityRegistry(options.cwd);

  const lines: string[] = [];
  const ctx: AdapterContext = {
    projectRoot: options.cwd,
    allowSideEffects: false,
    permissions: new Set(),
    log: (m) => lines.push(m),
  };

  if (options.probe) {
    for (const plugin of listPlugins()) {
      for (const tool of [...(plugin.tools ?? []), ...(plugin.media ?? [])]) {
        const result = await tool.probe(ctx);
        const existing = doc.capabilities.find((c) => c.adapterId === tool.id || c.id === `tool.${tool.id}`);
        if (existing) {
          doc = setCapabilityStatus(doc, existing.id, result.status);
          const cap = doc.capabilities.find((c) => c.id === existing.id)!;
          cap.provenance = {
            ...cap.provenance,
            verified: result.status === "available",
            notes: result.detail,
          };
        } else {
          doc = upsertCapability(doc, {
            id: `tool.${tool.id}`,
            kind: "tool",
            name: tool.name,
            description: result.detail,
            status: result.status,
            io: { inputs: [], outputs: [] },
            dependencies: [],
            permissions: ["shell"],
            provenance: {
              source: plugin.id,
              verified: result.status === "available",
              notes: result.detail,
            },
            executionMethod: "adapter",
            adapterId: tool.id,
            tags: [],
            meta: {},
          });
        }
        lines.push(`[${result.status}] ${tool.id}: ${result.detail}`);
      }
    }
    saveCapabilityRegistry(options.cwd, doc);
  }

  doc = ensureCapabilityRegistry(options.cwd);
  const tools = doc.capabilities.filter((c) => c.kind === "tool" || c.kind === "model");

  if (options.json) {
    printJson({ tools, probeLog: lines });
    return 0;
  }

  printLines([
    "Registered tools / models (lifecycle status is honest — probe with --probe):",
    "",
    ...tools.map(
      (t) =>
        `- [${t.status}] ${t.id} ${t.name}${t.provenance.verified ? " (verified)" : " (unverified)"}`,
    ),
    "",
    ...(options.probe ? ["Probe results:", ...lines] : ["Tip: omniskill tools --probe"]),
    "",
    "Skills ≠ tools ≠ models. A skill cannot supply a missing binary.",
  ]);
  return 0;
}
