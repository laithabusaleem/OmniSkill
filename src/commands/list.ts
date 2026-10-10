import { requireOmniInitialized } from "../core/config.js";
import { printJson, printLines } from "../core/io.js";
import { effectiveTrust, loadRegistry } from "../core/registry.js";

export async function runList(options: {
  cwd: string;
  domain?: string;
  json?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const registry = loadRegistry(options.cwd);
  let skills = registry.skills;
  if (options.domain) {
    const d = options.domain.toLowerCase();
    skills = skills.filter((s) => s.domains.some((x) => x.toLowerCase() === d));
  }

  const rows = skills.map((s) => ({
    id: s.id,
    name: s.name,
    domains: s.domains,
    stacks: s.stacks,
    priority: s.priority,
    sourceId: s.sourceId,
    cacheStatus: s.cacheStatus,
    trust: effectiveTrust(s, registry.sources),
  }));

  if (options.json) {
    printJson({ skills: rows, sources: registry.sources });
  } else {
    if (rows.length === 0) {
      printLines(["No skills registered."]);
      return 0;
    }
    printLines(
      rows.map(
        (r) =>
          `${r.name} [${r.id}] pri=${r.priority} cache=${r.cacheStatus} trust=${r.trust} domains=${r.domains.join("|") || "-"} stacks=${r.stacks.join("|") || "-"} source=${r.sourceId}`,
      ),
    );
  }
  return 0;
}
