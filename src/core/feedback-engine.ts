import type { SkillRegistry } from "../types/index.js";
import { appendLog } from "./logger.js";

export interface FeedbackInput {
  skillIds: string[];
  relevant: boolean;
  helpful: boolean;
  notes?: string;
  taskSummary?: string;
}

export interface RegistryRecommendation {
  skillId: string;
  action: "raise-priority" | "lower-priority" | "review";
  delta: number;
  rationale: string;
}

export function recordFeedback(projectRoot: string, input: FeedbackInput): void {
  appendLog(projectRoot, {
    timestamp: new Date().toISOString(),
    type: "feedback",
    taskSummary: input.taskSummary,
    selectedSkills: input.skillIds,
    feedback: {
      relevant: input.relevant,
      helpful: input.helpful,
      notes: input.notes,
    },
    outcome: "unverified",
  });
}

/**
 * Evidence-based recommendations only. Never auto-apply.
 * A single feedback event is insufficient to promote/remove a skill.
 */
export function recommendRegistryChanges(
  registry: SkillRegistry,
  recentFeedback: Array<{ skillIds: string[]; relevant?: boolean; helpful?: boolean }>,
): RegistryRecommendation[] {
  const stats = new Map<string, { relevant: number; irrelevant: number; helpful: number; unhelpful: number }>();

  for (const fb of recentFeedback) {
    for (const id of fb.skillIds) {
      const s = stats.get(id) ?? { relevant: 0, irrelevant: 0, helpful: 0, unhelpful: 0 };
      if (fb.relevant === true) s.relevant += 1;
      if (fb.relevant === false) s.irrelevant += 1;
      if (fb.helpful === true) s.helpful += 1;
      if (fb.helpful === false) s.unhelpful += 1;
      stats.set(id, s);
    }
  }

  const recs: RegistryRecommendation[] = [];
  for (const [skillId, s] of stats) {
    const skill = registry.skills.find((x) => x.id === skillId);
    if (!skill) continue;
    const samples = s.relevant + s.irrelevant;
    if (samples < 3) {
      recs.push({
        skillId,
        action: "review",
        delta: 0,
        rationale: `Only ${samples} feedback sample(s); insufficient evidence for automatic priority changes.`,
      });
      continue;
    }
    if (s.irrelevant >= 3 && s.irrelevant > s.relevant) {
      recs.push({
        skillId,
        action: "lower-priority",
        delta: -1,
        rationale: `${s.irrelevant} irrelevant vs ${s.relevant} relevant ratings (≥3 samples). Preview/revert required before apply.`,
      });
    } else if (s.relevant >= 3 && s.helpful >= 3 && s.relevant > s.irrelevant) {
      recs.push({
        skillId,
        action: "raise-priority",
        delta: 1,
        rationale: `${s.relevant} relevant and ${s.helpful} helpful ratings (≥3 samples). Preview/revert required before apply.`,
      });
    } else {
      recs.push({
        skillId,
        action: "review",
        delta: 0,
        rationale: "Mixed feedback; manual review recommended.",
      });
    }
  }
  return recs;
}
