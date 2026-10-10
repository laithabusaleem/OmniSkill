import type {
  CapabilityRecord,
  DiscoveryCandidate,
  DiscoveryQuery,
  ExecutionJob,
  LifecycleStatus,
} from "../types.js";

/** Stable contracts for plugins — implement without modifying the core engine. */

export interface DiscoveryProvider {
  id: string;
  name: string;
  /** Search / list candidates. Must not download indiscriminately. */
  discover(query: DiscoveryQuery, ctx: AdapterContext): Promise<DiscoveryCandidate[]>;
}

export interface ToolAdapter {
  id: string;
  name: string;
  /** Probe host for availability. Never claim available without a real check. */
  probe(ctx: AdapterContext): Promise<{ status: LifecycleStatus; detail: string }>;
  /** Optional execute — must verify outputs when claiming success. */
  execute?(
    input: Record<string, unknown>,
    ctx: AdapterContext,
  ): Promise<{ ok: boolean; message: string; artifacts?: string[]; verified?: boolean }>;
}

export interface MediaProcessor extends ToolAdapter {
  kind: "media";
  supportedOperations: string[];
}

export interface ModelProvider {
  id: string;
  name: string;
  modalities: Array<"text" | "image" | "audio" | "video">;
  probe(ctx: AdapterContext): Promise<{ status: LifecycleStatus; detail: string; paid?: boolean }>;
}

export interface AgentAdapterContract {
  id: string;
  name: string;
  /** Planning guidance only unless execute is implemented. */
  planHint(task: string): string;
}

export interface WorkflowTemplateProvider {
  id: string;
  listTemplateIds(): string[];
}

export interface AdapterContext {
  projectRoot: string;
  /** When false, adapters must not perform network or shell side effects. */
  allowSideEffects: boolean;
  /** Explicit permission grants for this invocation. */
  permissions: Set<string>;
  log: (line: string) => void;
}

export interface PlatformPlugin {
  id: string;
  discoveryProviders?: DiscoveryProvider[];
  tools?: ToolAdapter[];
  media?: MediaProcessor[];
  models?: ModelProvider[];
  agents?: AgentAdapterContract[];
  /** Register static capability metadata (unverified unless probe succeeds). */
  describe?(): CapabilityRecord[];
}

export type { ExecutionJob };
