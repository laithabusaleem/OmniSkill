import { classifyTask, classificationPreferDomains } from "../../core/classifier.js";
import { loadProfile } from "../../core/scanner.js";
import type { AdapterContext } from "../adapters/contracts.js";
import { ensureBuiltinPlugins, listPlugins } from "../plugins.js";
import type { DiscoveryQuery, DiscoveryResult } from "../types.js";

export async function discoverCapabilities(
  projectRoot: string,
  task: string,
  options: { offline?: boolean; allowSideEffects?: boolean } = {},
): Promise<DiscoveryResult> {
  ensureBuiltinPlugins();
  const profile = loadProfile(projectRoot);
  const classification = classifyTask(task, profile);
  const query: DiscoveryQuery = {
    task,
    domains: [classification.primaryDomain, ...classification.secondaryDomains, ...classificationPreferDomains(classification)],
    outputFormats: classification.outputFormats,
    requiredCapabilities: classification.requiredCapabilities,
    offline: options.offline,
  };

  const logs: string[] = [];
  const ctx: AdapterContext = {
    projectRoot,
    allowSideEffects: options.allowSideEffects ?? false,
    permissions: new Set(),
    log: (line) => logs.push(line),
  };

  const providersUsed: string[] = [];
  const all = [];
  for (const plugin of listPlugins()) {
    for (const provider of plugin.discoveryProviders ?? []) {
      providersUsed.push(provider.id);
      const found = await provider.discover(query, ctx);
      all.push(...found);
    }
  }

  // Deduplicate by capability id (keep highest score)
  const byId = new Map<string, (typeof all)[number]>();
  for (const c of all) {
    const prev = byId.get(c.capability.id);
    if (!prev || c.score > prev.score) byId.set(c.capability.id, c);
  }
  const candidates = [...byId.values()].sort((a, b) => b.score - a.score || a.capability.id.localeCompare(b.capability.id));

  return {
    query,
    candidates,
    providersUsed,
    coverage:
      "Providers searched: local skill dirs (optional write), in-project skill registry, local PATH tools. Not an exhaustive public GitHub crawl.",
    uncertainty: [
      "Scores are heuristics, not safety or quality proof.",
      "Unknown licenses remain unverified.",
      ...(options.offline ? ["Offline mode: no new network discovery."] : []),
      ...logs.slice(0, 5),
    ],
  };
}
