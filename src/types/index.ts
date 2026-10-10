export type TrustStatus = "unreviewed" | "reviewed" | "trusted" | "quarantined" | "blocked";

export type CacheStatus = "none" | "cached" | "stale" | "error";

export type OutcomeStatus =
  | "attempted"
  | "verified"
  | "unverified"
  | "failed"
  | "blocked"
  | "cancelled";

export interface ProjectProfile {
  schemaVersion: 1;
  scannedAt: string;
  root: string;
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  testRunners: string[];
  ci: string[];
  deployment: string[];
  monorepo: boolean;
  metadata: Record<string, string>;
  versions: Record<string, string>;
}

/** Distinguishes skills from non-interchangeable artifact types. */
export type SkillKind =
  | "skill"
  | "prompt-template"
  | "tool-integration"
  | "repository-index"
  | "application";

export type SourceKind = "github" | "local";

export interface SkillSource {
  id: string;
  owner: string;
  repo: string;
  url: string;
  description?: string;
  lastSyncedAt?: string;
  trustStatus: TrustStatus;
  /** Default github. Local sources are never fetched over the network. */
  kind?: SourceKind;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  domains: string[];
  stacks: string[];
  triggers: string[];
  sourceId: string;
  path: string;
  priority: number;
  cacheStatus: CacheStatus;
  contentHash?: string;
  lastSyncedAt?: string;
  reviewNotes?: string;
  disabled?: boolean;
  trustStatus?: TrustStatus;
  /** Default skill. Other kinds are not auto-treated as installable skills. */
  kind?: SkillKind;
  /** Capability ids from the capability registry this skill expects. */
  requiredCapabilities?: string[];
  /** Informal license hint from metadata — not legal advice. */
  licenseHint?: string;
}

export interface SkillRegistry {
  schemaVersion: number;
  updatedAt: string;
  sources: SkillSource[];
  skills: SkillRecord[];
}

export interface MatchFactor {
  name: string;
  score: number;
  detail: string;
}

export interface MatchCandidate {
  skillId: string;
  name: string;
  score: number;
  factors: MatchFactor[];
  reasons: string[];
  warnings: string[];
  available: boolean;
}

export interface MatchResult {
  task: string;
  candidates: MatchCandidate[];
  selected: MatchCandidate[];
  threshold: number;
  warnings: string[];
}

export interface ParsedSkill {
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  body: string;
  frontmatterRaw: string;
  references: string[];
}

export interface LogEvent {
  timestamp: string;
  type: string;
  taskSummary?: string;
  selectedSkills?: string[];
  integration?: string;
  outcome?: OutcomeStatus;
  verification?: string[];
  failureReasons?: string[];
  feedback?: {
    relevant?: boolean;
    helpful?: boolean;
    notes?: string;
  };
  meta?: Record<string, string | number | boolean>;
}

export interface DoctorCheck {
  id: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  remediation: string;
}

export interface OmniConfig {
  schemaVersion: 1;
  agent: "claude-code" | "cursor" | "portable";
  privacy: {
    logRawTask: boolean;
  };
  matching: {
    maxSkills: number;
    minScore: number;
  };
  bundle: {
    maxChars: number;
  };
  network: {
    timeoutMs: number;
    maxResponseBytes: number;
  };
  attribution: {
    /** When true, OmniSkill-generated bundles may include a short footer. */
    enabled: boolean;
    /** Public repo URL when known — never invent. */
    repositoryUrl?: string;
    /** Optional full footer override. */
    footerText?: string;
  };
  discovery: {
    /** Project-relative directories to scan for local SKILL.md files. */
    localSkillDirs: string[];
    /** When false, unreviewed skills are never auto-selected (manual review). */
    allowUnreviewedAutoSelect: boolean;
  };
  context: {
    /** Opt-in persistent project context under .omni/context.json */
    enabled: boolean;
  };
  orchestration: {
    /** Apply classifier domain preferences during match/discover. */
    autoClassifyOnMatch: boolean;
  };
}

export type DomainId =
  | "software"
  | "business"
  | "writing"
  | "social"
  | "research"
  | "design"
  | "education"
  | "general";

export type CapabilityStatus =
  | "available"
  | "unavailable"
  | "requires_configuration"
  | "requires_authorization";

export interface CapabilityDescriptor {
  id: string;
  name: string;
  status: CapabilityStatus;
  detail: string;
}

export interface TaskConstraint {
  budget?: string;
  deadline?: string;
  language?: string;
  quality?: string;
  other: string[];
}

export interface TaskClassification {
  task: string;
  primaryDomain: DomainId;
  secondaryDomains: DomainId[];
  desiredOutcome: string;
  deliverables: string[];
  outputFormats: string[];
  constraints: TaskConstraint;
  requiredCapabilities: string[];
  projectSignals: string[];
  needsClarification: boolean;
  clarificationQuestions: string[];
  confidence: number;
  reasons: string[];
}

export type ContextFactKind = "user_fact" | "external_evidence" | "ai_assumption";

export interface ContextEntry {
  id: string;
  key: string;
  value: string;
  kind: ContextFactKind;
  domain?: DomainId;
  sourceRef?: string;
  updatedAt: string;
}

export interface ProjectContext {
  schemaVersion: 1;
  enabled: boolean;
  updatedAt: string;
  entries: ContextEntry[];
}

export type WorkflowStageStatus =
  | "pending"
  | "ready"
  | "blocked"
  | "in_progress"
  | "done"
  | "failed"
  | "needs_review";

export interface WorkflowStage {
  id: string;
  title: string;
  description: string;
  domain: DomainId;
  dependsOn: string[];
  skillIds: string[];
  requiredCapabilities: string[];
  deliverables: string[];
  acceptanceCriteria: string[];
  status: WorkflowStageStatus;
  missingCapabilities: string[];
  requiresApproval: boolean;
  approvalReason?: string;
  notes: string[];
}

export interface WorkflowPlan {
  schemaVersion: 1;
  task: string;
  createdAt: string;
  classification: TaskClassification;
  templateId: string;
  stages: WorkflowStage[];
  selectedSkillIds: string[];
  unavailableCapabilities: string[];
  warnings: string[];
}
