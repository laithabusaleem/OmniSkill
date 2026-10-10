import type {
  MatchCandidate,
  MatchFactor,
  MatchResult,
  OmniConfig,
  ProjectProfile,
  SkillRecord,
  SkillRegistry,
} from "../types/index.js";
import { effectiveTrust } from "./registry.js";

const STOP = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "by", "from",
  "is", "are", "be", "this", "that", "it", "as", "at", "into", "your", "my", "our",
  "add", "make", "create", "build", "implement", "update", "fix", "please",
]);

export interface MatchOptions {
  maxSkills?: number;
  minScore?: number;
  includeAll?: boolean;
  preferences?: {
    preferDomains?: string[];
    preferStacks?: string[];
  };
}

function tokenize(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/[\s/_-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP.has(t));
  return [...new Set(tokens)];
}

function overlapScore(taskTokens: Set<string>, phrases: string[]): { score: number; hits: string[] } {
  const hits: string[] = [];
  let score = 0;
  for (const phrase of phrases) {
    const p = phrase.toLowerCase().trim();
    if (!p) continue;
    if (p.includes(" ")) {
      // multi-word: require all tokens present
      const parts = tokenize(p);
      if (parts.length > 0 && parts.every((t) => taskTokens.has(t))) {
        hits.push(phrase);
        score += 12 + Math.min(8, parts.length * 2);
      }
    } else if (taskTokens.has(p)) {
      hits.push(phrase);
      score += 10;
    }
  }
  return { score: Math.min(40, score), hits };
}

function domainScore(taskTokens: Set<string>, domains: string[]): { score: number; hits: string[] } {
  const hits: string[] = [];
  let score = 0;
  for (const d of domains) {
    const parts = tokenize(d);
    if (parts.some((p) => taskTokens.has(p)) || taskTokens.has(d.toLowerCase())) {
      hits.push(d);
      score += 8;
    }
  }
  return { score: Math.min(20, score), hits };
}

function stackScore(profile: ProjectProfile | null, stacks: string[]): { score: number; hits: string[]; penalty: number; warnings: string[] } {
  if (!profile || stacks.length === 0) {
    return { score: 5, hits: [], penalty: 0, warnings: [] };
  }
  const projectTech = new Set(
    [...profile.languages, ...profile.frameworks, ...profile.testRunners, ...profile.packageManagers].map((s) =>
      s.toLowerCase(),
    ),
  );
  const hits: string[] = [];
  const misses: string[] = [];
  for (const stack of stacks) {
    const s = stack.toLowerCase();
    const tokens = tokenize(s);
    const match = projectTech.has(s) || tokens.some((t) => projectTech.has(t));
    if (match) hits.push(stack);
    else misses.push(stack);
  }
  if (hits.length === 0 && stacks.length > 0) {
    return {
      score: 0,
      hits,
      penalty: 15,
      warnings: [`Stack mismatch: skill expects [${stacks.join(", ")}]`],
    };
  }
  return {
    score: Math.min(25, hits.length * 8),
    hits,
    penalty: 0,
    warnings: misses.length ? [`Partial stack mismatch: ${misses.join(", ")}`] : [],
  };
}

function preferenceBoost(
  skill: SkillRecord,
  preferences?: MatchOptions["preferences"],
): { score: number; detail: string } {
  if (!preferences) return { score: 0, detail: "none" };
  let score = 0;
  const details: string[] = [];
  for (const d of preferences.preferDomains ?? []) {
    if (skill.domains.map((x) => x.toLowerCase()).includes(d.toLowerCase())) {
      score += 5;
      details.push(`domain:${d}`);
    }
  }
  for (const s of preferences.preferStacks ?? []) {
    if (skill.stacks.map((x) => x.toLowerCase()).includes(s.toLowerCase())) {
      score += 5;
      details.push(`stack:${s}`);
    }
  }
  return { score: Math.min(15, score), detail: details.join(", ") || "none" };
}

export function matchSkills(
  task: string,
  profile: ProjectProfile | null,
  registry: SkillRegistry,
  config: OmniConfig,
  options: MatchOptions = {},
): MatchResult {
  const maxSkills = options.maxSkills ?? config.matching.maxSkills;
  const minScore = options.minScore ?? config.matching.minScore;
  const taskTokens = new Set(tokenize(task));
  const warnings: string[] = [];

  if (registry.skills.length === 0) {
    return {
      task,
      candidates: [],
      selected: [],
      threshold: minScore,
      warnings: ["Registry contains no skills. Run `omniskill add` or `omniskill sync`."],
    };
  }

  const candidates: MatchCandidate[] = [];

  for (const skill of registry.skills) {
    const trust = effectiveTrust(skill, registry.sources);
    const skillWarnings: string[] = [];
    const factors: MatchFactor[] = [];

    if (skill.disabled) {
      skillWarnings.push("Skill is disabled");
    }
    if (trust === "quarantined" || trust === "blocked") {
      skillWarnings.push(`Trust status ${trust} — never auto-selected`);
    }

    const triggers = overlapScore(taskTokens, [...skill.triggers, skill.name, ...tokenize(skill.description).slice(0, 8)]);
    factors.push({ name: "trigger_keyword", score: triggers.score, detail: triggers.hits.join(", ") || "none" });

    const domains = domainScore(taskTokens, skill.domains);
    factors.push({ name: "domain", score: domains.score, detail: domains.hits.join(", ") || "none" });

    const stacks = stackScore(profile, skill.stacks);
    factors.push({ name: "stack", score: stacks.score, detail: stacks.hits.join(", ") || "none" });
    skillWarnings.push(...stacks.warnings);

    const priorityScore = Math.min(10, Math.max(0, skill.priority));
    factors.push({ name: "priority", score: priorityScore, detail: String(skill.priority) });

    const pref = preferenceBoost(skill, options.preferences);
    factors.push({ name: "preference", score: pref.score, detail: pref.detail });

    let availability = 0;
    if (skill.cacheStatus === "cached") availability = 8;
    else if (skill.cacheStatus === "stale") availability = 4;
    else availability = 1;
    factors.push({ name: "availability", score: availability, detail: skill.cacheStatus });

    let trustScore = 0;
    if (trust === "trusted") trustScore = 6;
    else if (trust === "reviewed") trustScore = 4;
    else if (trust === "unreviewed") trustScore = 1;
    else trustScore = -100;
    factors.push({ name: "trust", score: Math.max(0, trustScore), detail: trust });

    let total = factors.reduce((sum, f) => sum + f.score, 0) - stacks.penalty;
    if (skill.disabled || trust === "quarantined" || trust === "blocked") {
      total = -1;
    }
    if (!config.discovery.allowUnreviewedAutoSelect && trust === "unreviewed") {
      skillWarnings.push("Unreviewed — auto-select disabled in config.discovery.allowUnreviewedAutoSelect");
      total = -1;
    }
    const kind = skill.kind ?? "skill";
    if (kind !== "skill" && kind !== "prompt-template") {
      skillWarnings.push(`Kind "${kind}" is not auto-selected as an agent skill`);
      total = -1;
    }

    const reasons: string[] = [];
    if (triggers.hits.length) reasons.push(`Trigger/keyword overlap: ${triggers.hits.slice(0, 4).join(", ")}`);
    if (domains.hits.length) reasons.push(`Domain relevance: ${domains.hits.join(", ")}`);
    if (stacks.hits.length) reasons.push(`Stack compatibility: ${stacks.hits.join(", ")}`);
    if (skill.priority >= 7) reasons.push(`High priority (${skill.priority})`);
    if (skill.cacheStatus !== "cached") reasons.push("Instructions may be unavailable until sync");

    candidates.push({
      skillId: skill.id,
      name: skill.name,
      score: Math.round(total * 10) / 10,
      factors,
      reasons,
      warnings: skillWarnings,
      available: skill.cacheStatus === "cached" || skill.cacheStatus === "stale",
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.skillId.localeCompare(b.skillId);
  });

  const eligible = candidates.filter((c) => c.score >= minScore && c.score >= 0);
  const selected = (options.includeAll ? eligible : eligible.slice(0, maxSkills));

  if (eligible.length === 0) {
    warnings.push(
      `No skill met the minimum relevance threshold (${minScore}). Try \`omniskill add\` for relevant sources, broaden the task description, or use --all to inspect near-misses.`,
    );
  }

  return {
    task,
    candidates: options.includeAll ? candidates : candidates.slice(0, Math.max(maxSkills, selected.length)),
    selected,
    threshold: minScore,
    warnings,
  };
}
