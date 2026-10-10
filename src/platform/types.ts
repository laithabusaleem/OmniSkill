/** Universal capability platform types (separate from skill-router SkillRecord). */

export type CapabilityKind = "skill" | "tool" | "model" | "workflow" | "agent";

export type LifecycleStatus =
  | "discovered"
  | "installed"
  | "configured"
  | "available"
  | "executed"
  | "verified"
  | "unavailable"
  | "blocked";

export type PermissionFlag =
  | "filesystem_read"
  | "filesystem_write"
  | "network"
  | "shell"
  | "spend_money"
  | "publish"
  | "destructive";

export interface ProvenanceMeta {
  source: string;
  url?: string;
  licenseHint?: string;
  importedAt?: string;
  /** True only when a human or automated check recorded verification. */
  verified: boolean;
  notes?: string;
}

export interface IoSchema {
  inputs: string[];
  outputs: string[];
}

export interface CapabilityRecord {
  id: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  status: LifecycleStatus;
  io: IoSchema;
  dependencies: string[];
  permissions: PermissionFlag[];
  provenance: ProvenanceMeta;
  executionMethod?: "none" | "shell" | "adapter" | "agent" | "http";
  adapterId?: string;
  verification?: string;
  tags: string[];
  meta: Record<string, string | number | boolean>;
}

export interface CapabilityRegistryDoc {
  schemaVersion: 1;
  updatedAt: string;
  capabilities: CapabilityRecord[];
}

export type ArtifactKind =
  | "document"
  | "code"
  | "image"
  | "audio"
  | "video"
  | "subtitle"
  | "script"
  | "storyboard"
  | "manifest"
  | "report"
  | "dataset"
  | "other";

export type ArtifactStatus = "planned" | "partial" | "produced" | "verified" | "failed";

export interface ArtifactRecord {
  id: string;
  name: string;
  kind: ArtifactKind;
  path: string;
  format?: string;
  status: ArtifactStatus;
  producedBy?: string;
  dependsOn: string[];
  provenance: string;
  verifiedChecks: string[];
  createdAt: string;
}

export interface ArtifactManifest {
  schemaVersion: 1;
  updatedAt: string;
  artifacts: ArtifactRecord[];
}

export type JobStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "partial";

export interface ExecutionStepResult {
  stepId: string;
  status: JobStatus;
  startedAt?: string;
  finishedAt?: string;
  message: string;
  artifacts: string[];
  verified: boolean;
  error?: string;
}

export interface ExecutionJob {
  id: string;
  task: string;
  planTemplateId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  steps: ExecutionStepResult[];
  approvalsRequired: string[];
  approvalsGranted: string[];
  artifactIds: string[];
  logs: string[];
}

export interface DiscoveryQuery {
  task: string;
  domains?: string[];
  outputFormats?: string[];
  requiredCapabilities?: string[];
  offline?: boolean;
}

export interface DiscoveryCandidate {
  capability: CapabilityRecord;
  score: number;
  decision: "select" | "review" | "reject";
  reasons: string[];
  warnings: string[];
  coverageNote: string;
}

export interface DiscoveryResult {
  query: DiscoveryQuery;
  candidates: DiscoveryCandidate[];
  providersUsed: string[];
  coverage: string;
  uncertainty: string[];
}
