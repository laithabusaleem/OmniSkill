import type { DiscoveryProvider, AdapterContext } from "../adapters/contracts.js";
import type { DiscoveryCandidate, DiscoveryQuery } from "../types.js";
import { loadConfig } from "../../core/config.js";
import { loadRegistry } from "../../core/registry.js";
import { discoverLocalSkills } from "../../core/local-skills.js";

export class LocalSkillDiscoveryProvider implements DiscoveryProvider {
  id = "discovery.local-skills";
  name = "Local SKILL.md directories";

  async discover(query: DiscoveryQuery, ctx: AdapterContext): Promise<DiscoveryCandidate[]> {
    const config = loadConfig(ctx.projectRoot);
    let registry = loadRegistry(ctx.projectRoot);
    const dirs = config.discovery.localSkillDirs.length
      ? config.discovery.localSkillDirs
      : [".agents/skills", "skills", ".claude/skills"];
    if (ctx.allowSideEffects) {
      const result = discoverLocalSkills(ctx.projectRoot, registry, dirs);
      registry = result.registry;
    }
    const task = query.task.toLowerCase();
    const out: DiscoveryCandidate[] = [];
    for (const skill of registry.skills.filter((s) => s.sourceId.startsWith("local__"))) {
      const blob = `${skill.name} ${skill.description} ${skill.domains.join(" ")} ${skill.triggers.join(" ")}`.toLowerCase();
      let score = 0;
      for (const tok of task.split(/\s+/)) if (tok.length > 2 && blob.includes(tok)) score += 4;
      out.push({
        capability: {
          id: `skill.${skill.id}`,
          kind: "skill",
          name: skill.name,
          description: skill.description,
          status: skill.cacheStatus === "cached" ? "installed" : "discovered",
          io: { inputs: ["task"], outputs: ["instructions"] },
          dependencies: skill.requiredCapabilities ?? [],
          permissions: [],
          provenance: {
            source: skill.sourceId,
            licenseHint: skill.licenseHint,
            verified: false,
            notes: "Local skill — untrusted until approved",
          },
          executionMethod: "none",
          tags: skill.domains,
          meta: { skillId: skill.id },
        },
        score,
        decision: score >= 8 ? "select" : score >= 4 ? "review" : "reject",
        reasons: [`Local skill metadata overlap score=${score}`],
        warnings: ["Instructions are not executed as code by OmniSkill"],
        coverageNote: "Local directories only",
      });
    }
    return out;
  }
}
