import type {
  MatchCandidate,
  OmniConfig,
  SkillKind,
  SkillRecord,
  SkillRegistry,
} from "../types/index.js";
import { readCachedSkillVerified } from "./cache.js";
import { missingCapabilities } from "./capabilities.js";
import { effectiveTrust } from "./registry.js";
import { scanSuspiciousInstructions } from "./security.js";

export type EvaluationDecision = "select" | "review" | "reject";

export interface SkillEvaluation {
  skillId: string;
  name: string;
  kind: SkillKind;
  decision: EvaluationDecision;
  score: number;
  relevanceScore: number;
  clarityScore: number;
  provenanceScore: number;
  compatibilityScore: number;
  licenseScore: number;
  securityScore: number;
  dependencyScore: number;
  overlapPenalty: number;
  reasons: string[];
  warnings: string[];
  inspectExcerpt?: string;
}

function kindOf(skill: SkillRecord): SkillKind {
  return skill.kind ?? "skill";
}

function clarityFromText(text: string | null): { score: number; detail: string } {
  if (!text) return { score: 2, detail: "instructions not cached — sync before trusting completeness" };
  const len = text.trim().length;
  if (len < 80) return { score: 2, detail: "very short instructions" };
  if (len < 400) return { score: 5, detail: "brief instructions" };
  if (/##\s+|###\s+|[-*]\s+/.test(text)) return { score: 10, detail: "structured markdown present" };
  return { score: 7, detail: "substantial body without clear structure" };
}

function licenseScore(skill: SkillRecord): { score: number; warnings: string[] } {
  const hint = (skill.licenseHint ?? "").toLowerCase();
  if (!hint) return { score: 5, warnings: ["No license hint in metadata — review upstream before redistribution"] };
  if (hint.includes("unknown") || hint.includes("proprietary")) {
    return { score: 1, warnings: [`License hint "${skill.licenseHint}" may restrict redistribution`] };
  }
  if (hint.includes("mit") || hint.includes("apache") || hint.includes("bsd") || hint.includes("cc0")) {
    return { score: 9, warnings: [] };
  }
  return { score: 4, warnings: [`License hint "${skill.licenseHint}" needs manual review`] };
}

/**
 * Transparent evaluation layered on matcher candidates.
 * Heuristic scores are not proof a skill is safe.
 */
export function evaluateSkills(options: {
  projectRoot: string;
  registry: SkillRegistry;
  config: OmniConfig;
  candidates: MatchCandidate[];
  selectedIds: string[];
  agent: OmniConfig["agent"];
}): SkillEvaluation[] {
  const selectedSet = new Set(options.selectedIds);
  const evals: SkillEvaluation[] = [];

  for (const candidate of options.candidates) {
    const skill = options.registry.skills.find((s) => s.id === candidate.skillId);
    if (!skill) continue;
    const kind = kindOf(skill);
    const trust = effectiveTrust(skill, options.registry.sources);
    const reasons = [...candidate.reasons];
    const warnings = [...candidate.warnings];

    const relevanceScore = Math.min(40, Math.max(0, candidate.score));
    const cached = readCachedSkillVerified(options.projectRoot, skill.id);
    const clarity = clarityFromText(cached.ok ? cached.content : null);
    let inspectExcerpt: string | undefined;
    if (cached.ok && cached.content) {
      inspectExcerpt = cached.content.slice(0, 400).replace(/\s+/g, " ").trim();
      const suspicious = scanSuspiciousInstructions(cached.content);
      if (suspicious.length) {
        warnings.push(`Suspicious instruction patterns: ${suspicious.join("; ")}`);
      }
    }

    let provenanceScore = 3;
    if (trust === "trusted") provenanceScore = 12;
    else if (trust === "reviewed") provenanceScore = 9;
    else if (trust === "unreviewed") provenanceScore = 4;
    else provenanceScore = 0;
    reasons.push(`Provenance/trust: ${trust}`);

    let compatibilityScore = 6;
    if (kind !== "skill" && kind !== "prompt-template") {
      compatibilityScore = 2;
      warnings.push(`Artifact kind "${kind}" is not interchangeable with an agent skill`);
    }
    if (options.agent === "portable" && kind === "tool-integration") {
      compatibilityScore = 1;
      warnings.push("Tool integrations are not portable Markdown skills");
    }

    const lic = licenseScore(skill);
    warnings.push(...lic.warnings);

    let securityScore = 10;
    if (warnings.some((w) => /suspicious/i.test(w))) securityScore = 2;
    if (trust === "quarantined" || trust === "blocked") securityScore = 0;

    const missing = missingCapabilities(options.projectRoot, skill.requiredCapabilities ?? []);
    let dependencyScore = 8;
    if (missing.length) {
      dependencyScore = Math.max(0, 8 - missing.length * 3);
      warnings.push(
        `Missing capabilities: ${missing.map((m) => `${m.id}(${m.status})`).join(", ")} — skill cannot supply tools`,
      );
    }

    let overlapPenalty = 0;
    const domainKey = skill.domains.slice().sort().join("|");
    const overlap = evals.filter((e) => {
      const other = options.registry.skills.find((s) => s.id === e.skillId);
      return other && other.domains.slice().sort().join("|") === domainKey && domainKey.length > 0;
    });
    if (overlap.length) {
      overlapPenalty = Math.min(8, overlap.length * 4);
      warnings.push("Overlaps domains with another evaluated skill");
    }

    let total =
      relevanceScore * 0.45 +
      clarity.score +
      provenanceScore +
      compatibilityScore +
      lic.score +
      securityScore +
      dependencyScore -
      overlapPenalty;

    let decision: EvaluationDecision = "select";
    if (kind !== "skill" && kind !== "prompt-template") decision = "reject";
    if (trust === "quarantined" || trust === "blocked" || skill.disabled) decision = "reject";
    if (securityScore <= 2) decision = "review";
    if (trust === "unreviewed" && !options.config.discovery.allowUnreviewedAutoSelect) decision = "review";
    if (decision === "select" && !selectedSet.has(skill.id) && candidate.score < options.config.matching.minScore) {
      decision = "reject";
    }
    if (decision === "select" && missing.some((m) => m.status === "unavailable" && (m.id === "video" || m.id === "publishing"))) {
      decision = "review";
      warnings.push("Marked for review due to unavailable high-risk/capability-heavy requirements");
    }

    reasons.push(`Clarity: ${clarity.detail}`);

    evals.push({
      skillId: skill.id,
      name: skill.name,
      kind,
      decision,
      score: Math.round(total * 10) / 10,
      relevanceScore,
      clarityScore: clarity.score,
      provenanceScore,
      compatibilityScore,
      licenseScore: lic.score,
      securityScore,
      dependencyScore,
      overlapPenalty,
      reasons,
      warnings,
      inspectExcerpt,
    });
  }

  evals.sort((a, b) => b.score - a.score || a.skillId.localeCompare(b.skillId));
  return evals;
}
