import type { DiscoveryProvider, AdapterContext } from "../adapters/contracts.js";
import type { DiscoveryCandidate, DiscoveryQuery } from "../types.js";
import { loadRegistry } from "../../core/registry.js";

/**
 * Uses already-registered GitHub skill sources / cache — does not crawl the internet.
 * Full repo search remains via `omniskill add` (targeted).
 */
export class GitHubSkillDiscoveryProvider implements DiscoveryProvider {
  id = "discovery.github-skills";
  name = "Cached GitHub skill registry";

  async discover(query: DiscoveryQuery, _ctx: AdapterContext): Promise<DiscoveryCandidate[]> {
    if (query.offline) {
      // still allowed — reading local registry
    }
    const registry = loadRegistry(_ctx.projectRoot);
    const task = query.task.toLowerCase();
    const out: DiscoveryCandidate[] = [];
    for (const skill of registry.skills) {
      const source = registry.sources.find((s) => s.id === skill.sourceId);
      if (source?.kind === "local") continue;
      const blob = `${skill.name} ${skill.description} ${skill.domains.join(" ")} ${skill.triggers.join(" ")}`.toLowerCase();
      let score = 0;
      for (const tok of task.split(/\s+/)) if (tok.length > 2 && blob.includes(tok)) score += 3;
      for (const d of query.domains ?? []) if (skill.domains.map((x) => x.toLowerCase()).includes(d.toLowerCase())) score += 5;
      const kind = skill.kind ?? "skill";
      out.push({
        capability: {
          id: `skill.${skill.id}`,
          kind: kind === "skill" || kind === "prompt-template" ? "skill" : "skill",
          name: skill.name,
          description: skill.description,
          status: skill.cacheStatus === "cached" ? "installed" : "discovered",
          io: { inputs: ["task"], outputs: ["instructions"] },
          dependencies: skill.requiredCapabilities ?? [],
          permissions: [],
          provenance: {
            source: skill.sourceId,
            url: source?.url,
            licenseHint: skill.licenseHint,
            verified: false,
            notes: "GitHub-backed skill metadata; README keywords ≠ compatibility",
          },
          executionMethod: "none",
          tags: [...skill.domains, kind],
          meta: { skillId: skill.id, path: skill.path },
        },
        score,
        decision:
          kind !== "skill" && kind !== "prompt-template"
            ? "reject"
            : score >= 10
              ? "select"
              : score >= 5
                ? "review"
                : "reject",
        reasons: [`Registry overlap score=${score}`, `kind=${kind}`],
        warnings:
          kind !== "skill" && kind !== "prompt-template"
            ? [`Not a skill artifact (${kind})`]
            : ["Untrusted third-party instructions"],
        coverageNote: "Indexed local registry only — not an exhaustive GitHub search",
      });
    }
    return out;
  }
}
