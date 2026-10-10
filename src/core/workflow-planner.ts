import type {
  DomainId,
  MatchResult,
  TaskClassification,
  WorkflowPlan,
  WorkflowStage,
} from "../types/index.js";
import { missingCapabilities } from "./capabilities.js";

interface StageTemplate {
  id: string;
  title: string;
  description: string;
  domain: DomainId;
  dependsOn: string[];
  capabilityHints: string[];
  deliverables: string[];
  acceptance: string[];
  requiresApproval?: boolean;
  approvalReason?: string;
}

interface PlanTemplate {
  id: string;
  domains: DomainId[];
  stages: StageTemplate[];
}

const TEMPLATES: PlanTemplate[] = [
  {
    id: "business-launch",
    domains: ["business", "research", "social"],
    stages: [
      {
        id: "assumptions",
        title: "Research assumptions",
        description: "List business assumptions and evidence gaps.",
        domain: "business",
        dependsOn: [],
        capabilityHints: ["local_files", "web_research"],
        deliverables: ["assumption log"],
        acceptance: ["Each assumption tagged user_fact / external_evidence / ai_assumption"],
      },
      {
        id: "customers",
        title: "Identify target customers",
        description: "Define segments and jobs-to-be-done.",
        domain: "business",
        dependsOn: ["assumptions"],
        capabilityHints: ["local_files"],
        deliverables: ["customer segments"],
        acceptance: ["At least one primary segment with pains and desired outcomes"],
      },
      {
        id: "competitors",
        title: "Evaluate competitors",
        description: "Compare alternatives without inventing market stats.",
        domain: "research",
        dependsOn: ["customers"],
        capabilityHints: ["web_research"],
        deliverables: ["competitor matrix"],
        acceptance: ["Sources cited or marked unavailable"],
      },
      {
        id: "offer",
        title: "Design offer",
        description: "Clarify value proposition and packaging.",
        domain: "business",
        dependsOn: ["customers", "competitors"],
        capabilityHints: ["local_files"],
        deliverables: ["offer brief"],
        acceptance: ["Clear promise, audience, and non-goals"],
      },
      {
        id: "pricing",
        title: "Model pricing",
        description: "Draft pricing hypotheses (not live billing).",
        domain: "business",
        dependsOn: ["offer"],
        capabilityHints: ["local_files"],
        deliverables: ["pricing hypotheses"],
        acceptance: ["Assumptions labeled; no invented competitor prices"],
      },
      {
        id: "sales-assets",
        title: "Prepare sales assets",
        description: "Outline pitch / one-pager / scripts.",
        domain: "business",
        dependsOn: ["pricing"],
        capabilityHints: ["document_export"],
        deliverables: ["sales asset outline"],
        acceptance: ["Claims matched to evidence or marked unverified"],
      },
      {
        id: "verify",
        title: "Verify claims and deliverables",
        description: "Review for overclaims and missing approvals.",
        domain: "research",
        dependsOn: ["sales-assets"],
        capabilityHints: ["local_files"],
        deliverables: ["verification checklist"],
        acceptance: ["No unverified numeric claims presented as fact"],
        requiresApproval: true,
        approvalReason: "Publishing or spending money requires explicit approval.",
      },
    ],
  },
  {
    id: "novel-writing",
    domains: ["writing"],
    stages: [
      {
        id: "premise",
        title: "Define premise",
        description: "Logline, genre, tone, audience.",
        domain: "writing",
        dependsOn: [],
        capabilityHints: ["local_files"],
        deliverables: ["premise sheet"],
        acceptance: ["One-sentence premise and conflict"],
      },
      {
        id: "bible",
        title: "Create story bible",
        description: "World rules, characters, timeline seeds.",
        domain: "writing",
        dependsOn: ["premise"],
        capabilityHints: ["local_files"],
        deliverables: ["story bible"],
        acceptance: ["Core characters and world rules recorded"],
      },
      {
        id: "plot",
        title: "Plan plot",
        description: "Major beats and act structure.",
        domain: "writing",
        dependsOn: ["bible"],
        capabilityHints: ["local_files"],
        deliverables: ["plot outline"],
        acceptance: ["Beginning, middle, end identifiable"],
      },
      {
        id: "arcs",
        title: "Establish character arcs",
        description: "Want/need/change for leads.",
        domain: "writing",
        dependsOn: ["plot"],
        capabilityHints: ["local_files"],
        deliverables: ["arc notes"],
        acceptance: ["Each major character has an arc statement"],
      },
      {
        id: "chapters",
        title: "Outline chapters",
        description: "Chapter goals and cliffhangers.",
        domain: "writing",
        dependsOn: ["arcs"],
        capabilityHints: ["local_files"],
        deliverables: ["chapter outline"],
        acceptance: ["Ordered chapter list with purpose"],
      },
      {
        id: "draft",
        title: "Draft",
        description: "Produce prose draft for agreed chapters.",
        domain: "writing",
        dependsOn: ["chapters"],
        capabilityHints: ["local_files"],
        deliverables: ["draft chapters"],
        acceptance: ["Draft exists for scoped chapters"],
      },
      {
        id: "revise",
        title: "Revise",
        description: "Edit for clarity and voice.",
        domain: "writing",
        dependsOn: ["draft"],
        capabilityHints: ["local_files"],
        deliverables: ["revision notes"],
        acceptance: ["Change list documented"],
      },
      {
        id: "continuity",
        title: "Run continuity checks",
        description: "Check timeline/character consistency.",
        domain: "writing",
        dependsOn: ["revise"],
        capabilityHints: ["local_files"],
        deliverables: ["continuity report"],
        acceptance: ["Open continuity issues listed"],
        requiresApproval: true,
        approvalReason: "Publishing manuscript requires user approval.",
      },
    ],
  },
  {
    id: "social-reel",
    domains: ["social", "business", "writing"],
    stages: [
      {
        id: "audience",
        title: "Define audience and objective",
        description: "Who watches and what action they take.",
        domain: "social",
        dependsOn: [],
        capabilityHints: ["local_files"],
        deliverables: ["brief"],
        acceptance: ["Audience + CTA stated"],
      },
      {
        id: "claims",
        title: "Research claims",
        description: "Validate any factual hooks.",
        domain: "research",
        dependsOn: ["audience"],
        capabilityHints: ["web_research"],
        deliverables: ["claims log"],
        acceptance: ["Unverified claims flagged"],
      },
      {
        id: "script",
        title: "Create hook and script",
        description: "Hook, beats, CTA; language-aware.",
        domain: "writing",
        dependsOn: ["claims"],
        capabilityHints: ["local_files"],
        deliverables: ["script"],
        acceptance: ["Timed sections estimated"],
      },
      {
        id: "storyboard",
        title: "Storyboard",
        description: "Shot list / visual plan.",
        domain: "design",
        dependsOn: ["script"],
        capabilityHints: ["local_files"],
        deliverables: ["storyboard"],
        acceptance: ["Each beat has a visual note"],
      },
      {
        id: "footage-plan",
        title: "Plan footage",
        description: "Assets needed; no fake renders.",
        domain: "social",
        dependsOn: ["storyboard"],
        capabilityHints: ["video"],
        deliverables: ["footage checklist"],
        acceptance: ["Missing assets listed"],
      },
      {
        id: "av",
        title: "Prepare voiceover and captions",
        description: "VO script + caption track.",
        domain: "social",
        dependsOn: ["script"],
        capabilityHints: ["audio", "local_files"],
        deliverables: ["captions draft"],
        acceptance: ["Caption text matches script language"],
      },
      {
        id: "assemble",
        title: "Assemble using available tools",
        description: "Only if video capability is available; else deliver production package.",
        domain: "social",
        dependsOn: ["footage-plan", "av"],
        capabilityHints: ["video"],
        deliverables: ["assembly plan or export"],
        acceptance: ["Honest about tool availability"],
        requiresApproval: true,
        approvalReason: "External publishing requires approval.",
      },
      {
        id: "verify-av",
        title: "Verify timing, audio, and export",
        description: "Checklist for duration, captions, loudness.",
        domain: "social",
        dependsOn: ["assemble"],
        capabilityHints: ["local_files"],
        deliverables: ["QA checklist"],
        acceptance: ["Export claimed only if tool succeeded"],
      },
    ],
  },
  {
    id: "software-feature",
    domains: ["software"],
    stages: [
      {
        id: "scope",
        title: "Clarify scope",
        description: "Acceptance criteria and non-goals.",
        domain: "software",
        dependsOn: [],
        capabilityHints: ["local_files"],
        deliverables: ["scope notes"],
        acceptance: ["Testable acceptance criteria"],
      },
      {
        id: "implement",
        title: "Implement",
        description: "Code changes with project constraints.",
        domain: "software",
        dependsOn: ["scope"],
        capabilityHints: ["local_files", "code_execution"],
        deliverables: ["code diff plan"],
        acceptance: ["Changes mapped to criteria"],
      },
      {
        id: "verify-sw",
        title: "Verify",
        description: "Run available tests; mark unverified otherwise.",
        domain: "software",
        dependsOn: ["implement"],
        capabilityHints: ["code_execution"],
        deliverables: ["verification report"],
        acceptance: ["Attempted vs verified checks listed"],
      },
    ],
  },
  {
    id: "generic-delivery",
    domains: ["general"],
    stages: [
      {
        id: "clarify",
        title: "Clarify outcome",
        description: "Confirm deliverables and constraints.",
        domain: "general",
        dependsOn: [],
        capabilityHints: ["local_files"],
        deliverables: ["clarified brief"],
        acceptance: ["Outcome stated in one paragraph"],
      },
      {
        id: "outline",
        title: "Outline work",
        description: "Break into reviewable steps.",
        domain: "general",
        dependsOn: ["clarify"],
        capabilityHints: ["local_files"],
        deliverables: ["work outline"],
        acceptance: ["Ordered steps with owners (user/agent)"],
      },
      {
        id: "produce",
        title: "Produce draft",
        description: "Create draft artifacts in available formats.",
        domain: "general",
        dependsOn: ["outline"],
        capabilityHints: ["document_export"],
        deliverables: ["draft artifacts"],
        acceptance: ["Draft paths listed"],
      },
      {
        id: "review",
        title: "Review and revise",
        description: "User review loop.",
        domain: "general",
        dependsOn: ["produce"],
        capabilityHints: ["local_files"],
        deliverables: ["revision list"],
        acceptance: ["Open issues tracked"],
        requiresApproval: true,
        approvalReason: "External sharing requires approval.",
      },
    ],
  },
];

function pickTemplate(classification: TaskClassification): PlanTemplate {
  const domains = new Set([classification.primaryDomain, ...classification.secondaryDomains]);
  let best: PlanTemplate = TEMPLATES.find((t) => t.id === "generic-delivery")!;
  let bestScore = -1;
  for (const t of TEMPLATES) {
    if (t.id === "generic-delivery") continue;
    let score = 0;
    for (const d of t.domains) if (domains.has(d)) score += d === classification.primaryDomain ? 3 : 1;
    // Prefer templates whose first domain is the primary task domain (breaks ties).
    if (t.domains[0] === classification.primaryDomain) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore > 0 ? best : TEMPLATES.find((t) => t.id === "generic-delivery")!;
}

function mapSkillsToStage(stage: StageTemplate, match: MatchResult | null): string[] {
  if (!match) return [];
  const domainHints = new Set([stage.domain, ...stage.title.toLowerCase().split(/\s+/)]);
  const scored = match.selected.map((c) => {
    const blob = `${c.name} ${c.reasons.join(" ")}`.toLowerCase();
    let s = c.score;
    for (const h of domainHints) if (blob.includes(h)) s += 5;
    return { id: c.skillId, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, 2).map((x) => x.id);
}

export function buildWorkflowPlan(options: {
  projectRoot: string;
  classification: TaskClassification;
  match?: MatchResult | null;
}): WorkflowPlan {
  const template = pickTemplate(options.classification);
  const warnings: string[] = [];
  const unavailable = new Set<string>();

  if (options.classification.needsClarification) {
    warnings.push("Classification suggests clarification before irreversible work.");
  }

  const stages: WorkflowStage[] = template.stages.map((st) => {
    const required = [...new Set([...st.capabilityHints, ...options.classification.requiredCapabilities.filter((c) => st.capabilityHints.includes(c))])];
    const missing = missingCapabilities(options.projectRoot, required);
    for (const m of missing) unavailable.add(m.id);

    const notes: string[] = [];
    for (const m of missing) {
      if (m.id === "video" || m.id === "image_generation" || m.id === "audio") {
        notes.push(
          `Capability ${m.id} is ${m.status}. Deliver a production-ready plan/storyboard instead of claiming a finished media file.`,
        );
      } else {
        notes.push(`Capability ${m.id} is ${m.status}: ${m.detail}`);
      }
    }

    const status =
      missing.some((m) => m.status === "unavailable" && (m.id === "video" || m.id === "image_generation"))
        ? ("ready" as const) // still plannable
        : missing.length
          ? ("blocked" as const)
          : ("pending" as const);

    return {
      id: st.id,
      title: st.title,
      description: st.description,
      domain: st.domain,
      dependsOn: st.dependsOn,
      skillIds: mapSkillsToStage(st, options.match ?? null),
      requiredCapabilities: required,
      deliverables: st.deliverables,
      acceptanceCriteria: st.acceptance,
      status: status === "blocked" && missing.every((m) => m.id === "web_research") ? "ready" : status,
      missingCapabilities: missing.map((m) => m.id),
      requiresApproval: Boolean(st.requiresApproval),
      approvalReason: st.approvalReason,
      notes,
    };
  });

  // Soften: web_research missing should not hard-block planning stages
  for (const stage of stages) {
    if (stage.status === "blocked" && stage.missingCapabilities.every((id) => id === "web_research" || id === "code_execution")) {
      stage.status = "ready";
      stage.notes.push("Proceeding with local/offline alternatives where network or execution is unavailable.");
    }
  }

  return {
    schemaVersion: 1,
    task: options.classification.task,
    createdAt: new Date().toISOString(),
    classification: options.classification,
    templateId: template.id,
    stages,
    selectedSkillIds: options.match?.selected.map((s) => s.skillId) ?? [],
    unavailableCapabilities: [...unavailable],
    warnings,
  };
}

export function workflowPlanToMarkdown(plan: WorkflowPlan): string {
  const lines: string[] = [
    "# OmniSkill workflow plan",
    "",
    `Task: ${plan.task}`,
    `Template: ${plan.templateId}`,
    `Created: ${plan.createdAt}`,
    `Primary domain: ${plan.classification.primaryDomain}`,
    `Secondary: ${plan.classification.secondaryDomains.join(", ") || "none"}`,
    "",
    "## Outcome",
    "",
    plan.classification.desiredOutcome,
    "",
    "## Deliverables",
    "",
    ...plan.classification.deliverables.map((d) => `- ${d}`),
    "",
  ];
  if (plan.unavailableCapabilities.length) {
    lines.push("## Unavailable or limited capabilities", "");
    for (const id of plan.unavailableCapabilities) lines.push(`- \`${id}\``);
    lines.push("");
  }
  if (plan.warnings.length) {
    lines.push("## Warnings", "");
    for (const w of plan.warnings) lines.push(`- ${w}`);
    lines.push("");
  }
  lines.push("## Stages", "");
  for (const s of plan.stages) {
    lines.push(`### ${s.id}: ${s.title}`);
    lines.push("");
    lines.push(s.description);
    lines.push("");
    lines.push(`- Status: \`${s.status}\``);
    lines.push(`- Domain: ${s.domain}`);
    lines.push(`- Depends on: ${s.dependsOn.join(", ") || "—"}`);
    lines.push(`- Skills: ${s.skillIds.join(", ") || "none matched yet"}`);
    lines.push(`- Capabilities: ${s.requiredCapabilities.join(", ") || "—"}`);
    if (s.missingCapabilities.length) lines.push(`- Missing: ${s.missingCapabilities.join(", ")}`);
    if (s.requiresApproval) lines.push(`- Approval required: ${s.approvalReason ?? "yes"}`);
    lines.push("- Deliverables:");
    for (const d of s.deliverables) lines.push(`  - ${d}`);
    lines.push("- Acceptance:");
    for (const a of s.acceptanceCriteria) lines.push(`  - ${a}`);
    for (const n of s.notes) lines.push(`- Note: ${n}`);
    lines.push("");
  }
  lines.push("_Skills guide agents; they do not supply missing tools._");
  lines.push("");
  return lines.join("\n");
}
