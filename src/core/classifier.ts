import type {
  DomainId,
  ProjectProfile,
  TaskClassification,
  TaskConstraint,
} from "../types/index.js";

interface DomainRule {
  domain: DomainId;
  weight: number;
  keywords: string[];
  phrases: string[];
}

const DOMAIN_RULES: DomainRule[] = [
  {
    domain: "software",
    weight: 1,
    keywords: [
      "api", "code", "typescript", "javascript", "python", "react", "next", "backend",
      "frontend", "database", "refactor", "bug", "test", "ci", "deploy", "auth", "sdk",
      "cli", "npm", "docker", "kubernetes", "graphql", "sql",
    ],
    phrases: ["pull request", "unit test", "dark mode", "typecheck", "open source"],
  },
  {
    domain: "business",
    weight: 1,
    keywords: [
      "business", "startup", "market", "customer", "competitor", "pricing", "sales",
      "revenue", "pitch", "offer", "gtm", "entrepreneur", "saas", "monetize", "funnel",
      "investor", "positioning", "segment",
    ],
    phrases: ["go to market", "business model", "target audience", "value proposition"],
  },
  {
    domain: "writing",
    weight: 1,
    keywords: [
      "novel", "chapter", "story", "character", "plot", "manuscript", "edit", "prose",
      "fiction", "narrative", "outline", "screenplay", "copywriting", "blog", "essay",
      "arabic", "translation",
    ],
    phrases: ["story bible", "character arc", "long form", "continuity check"],
  },
  {
    domain: "social",
    weight: 1,
    keywords: [
      "reel", "tiktok", "instagram", "youtube", "shortform", "caption", "hook",
      "storyboard", "voiceover", "script", "viral", "content", "thumbnail", "broll",
    ],
    phrases: ["short form", "social media", "video script", "production plan"],
  },
  {
    domain: "research",
    weight: 1,
    keywords: [
      "research", "sources", "citation", "literature", "survey", "evidence", "study",
      "analysis", "academic", "whitepaper", "factcheck",
    ],
    phrases: ["market research", "competitive analysis", "literature review"],
  },
  {
    domain: "design",
    weight: 1,
    keywords: [
      "design", "brand", "branding", "logo", "visual", "typography", "palette",
      "mockup", "ux", "ui", "figma", "identity", "aesthetic",
    ],
    phrases: ["brand guidelines", "visual identity", "design system"],
  },
  {
    domain: "education",
    weight: 1,
    keywords: [
      "lesson", "course", "curriculum", "teach", "tutorial", "presentation", "slides",
      "workshop", "lecture", "homework", "syllabus",
    ],
    phrases: ["slide deck", "learning objective", "teaching plan"],
  },
];

const DELIVERABLE_PATTERNS: Array<{ re: RegExp; label: string; format?: string }> = [
  { re: /\b(pdf|docx?|markdown|md)\b/i, label: "document", format: "markdown/doc" },
  { re: /\b(pptx?|slides?|deck)\b/i, label: "presentation", format: "slides" },
  { re: /\b(reel|tiktok|short[- ]?form video|mp4)\b/i, label: "short-form video plan", format: "video-plan" },
  { re: /\b(novel|manuscript|chapter)\b/i, label: "manuscript / chapters", format: "prose" },
  { re: /\b(script|screenplay|voiceover)\b/i, label: "script", format: "script" },
  { re: /\b(storyboard)\b/i, label: "storyboard", format: "storyboard" },
  { re: /\b(pitch|deck)\b/i, label: "pitch materials", format: "presentation" },
  { re: /\b(brand|logo|guidelines)\b/i, label: "brand assets / guidelines", format: "design-docs" },
  { re: /\b(api|pr|pull request|code)\b/i, label: "code changes", format: "source" },
];

const CAPABILITY_HINTS: Array<{ re: RegExp; id: string }> = [
  { re: /\b(web|online|live market|browse|search the web)\b/i, id: "web_research" },
  { re: /\b(image|illustration|render|generate art)\b/i, id: "image_generation" },
  { re: /\b(audio|voiceover|tts|transcrib)/i, id: "audio" },
  { re: /\b(video|reel|edit footage|render video|mp4)\b/i, id: "video" },
  { re: /\b(pptx?|slides?|presentation export)\b/i, id: "document_export" },
  { re: /\b(publish|post to|upload to|tweet)\b/i, id: "publishing" },
  { re: /\b(run tests|execute|shell|terminal)\b/i, id: "code_execution" },
  { re: /\b(read|write|file|folder|document)\b/i, id: "local_files" },
];

function normalize(text: string): string {
  return text.toLowerCase();
}

function scoreDomain(text: string, rule: DomainRule): { score: number; hits: string[] } {
  const hits: string[] = [];
  let score = 0;
  for (const phrase of rule.phrases) {
    if (text.includes(phrase)) {
      hits.push(phrase);
      score += 6;
    }
  }
  for (const kw of rule.keywords) {
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) {
      hits.push(kw);
      score += 3;
    }
  }
  return { score: score * rule.weight, hits: [...new Set(hits)] };
}

function extractConstraints(task: string): TaskConstraint {
  const other: string[] = [];
  let budget: string | undefined;
  let deadline: string | undefined;
  let language: string | undefined;
  let quality: string | undefined;

  const budgetMatch = task.match(/\b(?:budget|max spend)\s*[:=]?\s*([$€£]?\d[\d,]*(?:\.\d+)?(?:\s*(?:usd|eur|sar|aed))?)/i);
  if (budgetMatch?.[1]) budget = budgetMatch[1];

  const deadlineMatch = task.match(/\b(?:deadline|due|by)\s*[:=]?\s*([^\n,;.]+)/i);
  if (deadlineMatch?.[1]) deadline = deadlineMatch[1].trim().slice(0, 80);

  const langMatch = task.match(/\b(?:in|language)\s+(arabic|english|hebrew|french|spanish|german|mandarin|hindi)\b/i);
  if (langMatch?.[1]) language = langMatch[1].toLowerCase();
  if (/\barabic\b/i.test(task) && !language) language = "arabic";

  if (/\b(high[- ]quality|production[- ]ready|polished)\b/i.test(task)) quality = "high";
  if (/\b(draft|rough|quick)\b/i.test(task)) quality = quality ?? "draft";

  if (/\bno\s+hallucin/i.test(task)) other.push("no-hallucinated-claims");
  if (/\bdo not publish\b/i.test(task)) other.push("no-publish");

  return { budget, deadline, language, quality, other };
}

function projectSignals(profile: ProjectProfile | null): string[] {
  if (!profile) return [];
  const signals: string[] = [];
  if (profile.languages.length) signals.push(`languages:${profile.languages.join(",")}`);
  if (profile.frameworks.length) signals.push(`frameworks:${profile.frameworks.join(",")}`);
  if (profile.testRunners.length) signals.push(`tests:${profile.testRunners.join(",")}`);
  return signals;
}

function inferOutcome(task: string, domains: DomainId[]): string {
  const t = task.trim().replace(/\s+/g, " ");
  if (t.length <= 160) return t;
  const primary = domains[0] ?? "general";
  return `Produce a verified ${primary} outcome for: ${t.slice(0, 120)}…`;
}

/**
 * Deterministic multi-domain task classification from local text + optional profile.
 * Does not call external models. Scores are heuristics, not proof of correctness.
 */
export function classifyTask(task: string, profile: ProjectProfile | null = null): TaskClassification {
  const text = normalize(task);
  const scored = DOMAIN_RULES.map((rule) => {
    const { score, hits } = scoreDomain(text, rule);
    return { domain: rule.domain, score, hits };
  }).sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));

  const primary = scored[0] && scored[0].score > 0 ? scored[0].domain : "general";
  const secondary = scored
    .filter((s) => s.domain !== primary && s.score >= 6)
    .slice(0, 4)
    .map((s) => s.domain);

  // Profile bias toward software when strong tech signals and weak non-software scores
  if (profile && (profile.frameworks.length > 0 || profile.languages.includes("typescript") || profile.languages.includes("javascript"))) {
    if (primary === "general" || (scored.find((s) => s.domain === "software")?.score ?? 0) >= 3) {
      // keep software as secondary if not primary
      if (
        primary !== "software" &&
        !secondary.includes("software") &&
        (scored.find((s) => s.domain === "software")?.score ?? 0) > 0
      ) {
        secondary.unshift("software");
      }
    }
  }

  const deliverables: string[] = [];
  const outputFormats: string[] = [];
  for (const p of DELIVERABLE_PATTERNS) {
    if (p.re.test(task)) {
      deliverables.push(p.label);
      if (p.format) outputFormats.push(p.format);
    }
  }
  if (deliverables.length === 0) {
    deliverables.push("structured plan and draft artifacts in Markdown");
    outputFormats.push("markdown");
  }

  const constraints = extractConstraints(task);
  const requiredCapabilities = [...new Set(CAPABILITY_HINTS.filter((h) => h.re.test(task)).map((h) => h.id))];
  if (!requiredCapabilities.includes("local_files")) requiredCapabilities.push("local_files");

  const reasons: string[] = [];
  for (const s of scored.filter((x) => x.score > 0).slice(0, 5)) {
    reasons.push(`${s.domain}=${s.score} (${s.hits.slice(0, 5).join(", ") || "signals"})`);
  }

  const vague = task.trim().split(/\s+/).length < 4;
  const needsClarification = vague || (primary === "general" && secondary.length === 0);
  const clarificationQuestions: string[] = [];
  if (vague) clarificationQuestions.push("What concrete deliverable should be produced?");
  if (!constraints.language && /\b(copy|script|caption|novel)\b/i.test(task)) {
    clarificationQuestions.push("Which language should the writing use?");
  }
  if (requiredCapabilities.includes("video") || requiredCapabilities.includes("image_generation")) {
    clarificationQuestions.push("Should OmniSkill plan only, or do you have rendering tools configured?");
  }

  const top = scored[0]?.score ?? 0;
  const confidence = Math.min(0.95, 0.35 + Math.min(top, 30) / 40 + secondary.length * 0.05);

  return {
    task,
    primaryDomain: primary,
    secondaryDomains: [...new Set(secondary)].slice(0, 4),
    desiredOutcome: inferOutcome(task, [primary, ...secondary]),
    deliverables: [...new Set(deliverables)],
    outputFormats: [...new Set(outputFormats)],
    constraints,
    requiredCapabilities,
    projectSignals: projectSignals(profile),
    needsClarification,
    clarificationQuestions,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
  };
}

/** Map classification domains to skill domain preference strings. */
export function classificationPreferDomains(c: TaskClassification): string[] {
  const map: Record<DomainId, string[]> = {
    software: ["software", "frontend", "backend", "testing", "security", "qa", "ui", "theming", "auth"],
    business: ["business", "sales", "marketing", "strategy", "entrepreneurship"],
    writing: ["writing", "storytelling", "editing", "novel", "copywriting"],
    social: ["social", "marketing", "video", "content", "scripting"],
    research: ["research", "education", "analysis"],
    design: ["design", "branding", "creative", "ui"],
    education: ["education", "research", "presentation"],
    general: [],
  };
  const out = new Set<string>();
  for (const d of [c.primaryDomain, ...c.secondaryDomains]) {
    for (const x of map[d] ?? []) out.add(x);
  }
  return [...out];
}
