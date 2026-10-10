import type { OmniConfig, SkillRecord, SkillRegistry } from "../types/index.js";
import { writeCachedSkill, writeCacheMeta } from "./cache.js";
import { contentHash } from "./security.js";
import {
  discoverSkillPaths,
  fetchFileRaw,
  fetchRepoTree,
  networkOptionsFromConfig,
  resolveRepoInput,
} from "./fetcher.js";
import {
  effectiveTrust,
  skillIdFor,
  sourceIdFor,
  upsertSkills,
  upsertSource,
} from "./registry.js";
import { parseSkillMarkdown } from "./skill-parser.js";
import { OmniError } from "./errors.js";

export interface SyncSummary {
  sourceId: string;
  discovered: number;
  registered: number;
  cached: number;
  unchanged: number;
  failed: Array<{ path: string; error: string }>;
  skipped: Array<{ path: string; reason: string }>;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

export async function addRepository(
  projectRoot: string,
  registry: SkillRegistry,
  input: string,
  config: OmniConfig,
  fetchImpl?: typeof fetch,
): Promise<{ registry: SkillRegistry; summary: SyncSummary }> {
  const ref = resolveRepoInput(input);
  const sourceId = sourceIdFor(ref.owner, ref.repo);
  const opts = networkOptionsFromConfig(config, fetchImpl);

  let tree;
  try {
    tree = await fetchRepoTree(ref, opts);
  } catch (err) {
    throw err instanceof OmniError
      ? err
      : new OmniError("ADD_FAILED", err instanceof Error ? err.message : String(err));
  }

  const skillPaths = discoverSkillPaths(tree);
  const next = upsertSource(registry, {
    id: sourceId,
    owner: ref.owner,
    repo: ref.repo,
    url: ref.url,
    description: `Discovered from ${ref.owner}/${ref.repo}`,
    lastSyncedAt: new Date().toISOString(),
    trustStatus: "unreviewed",
  });

  const summary: SyncSummary = {
    sourceId,
    discovered: skillPaths.length,
    registered: 0,
    cached: 0,
    unchanged: 0,
    failed: [],
    skipped: [],
  };

  const skills: SkillRecord[] = [];
  for (const path of skillPaths) {
    try {
      const content = await fetchFileRaw(ref, path, opts);
      const parsed = parseSkillMarkdown(content);
      const id = skillIdFor(sourceId, path);
      const hash = contentHash(content);
      const existing = registry.skills.find((s) => s.id === id);
      if (existing?.contentHash === hash && existing.cacheStatus === "cached") {
        summary.unchanged += 1;
        skills.push({ ...existing, lastSyncedAt: new Date().toISOString() });
        continue;
      }
      writeCachedSkill(projectRoot, id, content);
      writeCacheMeta(projectRoot, id, {
        sourceId,
        path,
        contentHash: hash,
        syncedAt: new Date().toISOString(),
      });
      skills.push({
        id,
        name: parsed.name,
        description: parsed.description,
        domains: asStringArray(parsed.metadata.domains),
        stacks: asStringArray(parsed.metadata.stacks),
        triggers: asStringArray(parsed.metadata.triggers),
        sourceId,
        path,
        priority: typeof parsed.metadata.priority === "number" ? Math.min(10, Math.max(0, parsed.metadata.priority)) : 5,
        cacheStatus: "cached",
        contentHash: hash,
        lastSyncedAt: new Date().toISOString(),
        trustStatus: "unreviewed",
      });
      summary.registered += 1;
      summary.cached += 1;
    } catch (err) {
      summary.failed.push({
        path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { registry: upsertSkills(next, skills), summary };
}

export async function syncRegistry(
  projectRoot: string,
  registry: SkillRegistry,
  config: OmniConfig,
  sourceFilter?: string,
  fetchImpl?: typeof fetch,
): Promise<{ registry: SkillRegistry; summaries: SyncSummary[] }> {
  const sources = sourceFilter
    ? registry.sources.filter((s) => s.id === sourceFilter)
    : registry.sources;

  if (sourceFilter && sources.length === 0) {
    throw new OmniError("SOURCE_NOT_FOUND", `No source with id ${sourceFilter}`);
  }

  let current = registry;
  const summaries: SyncSummary[] = [];

  for (const source of sources) {
    if (source.kind === "local" || source.url.startsWith("local://")) {
      summaries.push({
        sourceId: source.id,
        discovered: 0,
        registered: 0,
        cached: 0,
        unchanged: 0,
        failed: [],
        skipped: [{ path: "*", reason: "local source — use discover --local" }],
      });
      continue;
    }
    if (source.trustStatus === "blocked") {
      summaries.push({
        sourceId: source.id,
        discovered: 0,
        registered: 0,
        cached: 0,
        unchanged: 0,
        failed: [],
        skipped: [{ path: "*", reason: "source blocked" }],
      });
      continue;
    }

    const result = await addRepository(
      projectRoot,
      current,
      `${source.owner}/${source.repo}`,
      config,
      fetchImpl,
    );
    current = result.registry;
    summaries.push(result.summary);

    // Preserve quarantined/blocked skill trust when re-syncing
    current = {
      ...current,
      skills: current.skills.map((skill) => {
        const prev = registry.skills.find((s) => s.id === skill.id);
        if (!prev) return skill;
        const trust = effectiveTrust(prev, registry.sources);
        if (trust === "quarantined" || trust === "blocked") {
          return { ...skill, trustStatus: trust, disabled: prev.disabled };
        }
        return skill;
      }),
    };
  }

  return { registry: current, summaries };
}
