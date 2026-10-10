import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { SkillRecord, SkillRegistry, SkillSource } from "../types/index.js";
import { writeCachedSkill, writeCacheMeta } from "./cache.js";
import { contentHash, resolveInsideRoot } from "./security.js";
import { parseSkillMarkdown } from "./skill-parser.js";
import { saveRegistry, skillIdFor, upsertSkills, upsertSource } from "./registry.js";

const LOCAL_SOURCE_ID = "local__project-skills";

function walkSkillFiles(dir: string, out: string[], depth = 0): void {
  if (depth > 6) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name === ".omni") continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkSkillFiles(full, out, depth + 1);
    else if (st.isFile() && name === "SKILL.md") out.push(full);
  }
}

export interface LocalDiscoverResult {
  sourceId: string;
  discovered: number;
  registered: number;
  skillIds: string[];
  warnings: string[];
}

/**
 * Discover SKILL.md under configured local directories and register them.
 * Never executes skill content. Deduplicates by skill id.
 */
export function discoverLocalSkills(
  projectRoot: string,
  registry: SkillRegistry,
  dirs: string[],
): { registry: SkillRegistry; result: LocalDiscoverResult } {
  const warnings: string[] = [];
  const skillIds: string[] = [];
  const records: SkillRecord[] = [];

  const source: SkillSource = {
    id: LOCAL_SOURCE_ID,
    owner: "local",
    repo: "project-skills",
    url: "local://project-skills",
    description: "Local project skill directories (untrusted until reviewed).",
    trustStatus: "unreviewed",
    kind: "local",
  };

  let reg = upsertSource(registry, source);

  for (const rel of dirs) {
    let abs: string;
    try {
      abs = resolveInsideRoot(projectRoot, rel);
    } catch {
      warnings.push(`Skipped unsafe local skill dir: ${rel}`);
      continue;
    }
    if (!existsSync(abs)) {
      warnings.push(`Local skill dir missing: ${rel}`);
      continue;
    }
    const files: string[] = [];
    walkSkillFiles(abs, files);
    for (const file of files) {
      const relPath = relative(projectRoot, file).split(sep).join("/");
      let raw: string;
      try {
        raw = readFileSync(file, "utf8");
      } catch {
        warnings.push(`Could not read ${relPath}`);
        continue;
      }
      let parsed;
      try {
        parsed = parseSkillMarkdown(raw);
      } catch (err) {
        warnings.push(`Malformed skill at ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      const id = skillIdFor(LOCAL_SOURCE_ID, relPath);
      const hash = contentHash(raw);
      writeCachedSkill(projectRoot, id, raw);
      writeCacheMeta(projectRoot, id, {
        sourceId: LOCAL_SOURCE_ID,
        path: relPath,
        contentHash: hash,
        syncedAt: new Date().toISOString(),
      });
      const meta = parsed.metadata;
      const domains = Array.isArray(meta.domains)
        ? meta.domains.map(String)
        : typeof meta.domain === "string"
          ? [meta.domain]
          : [];
      const triggers = Array.isArray(meta.triggers)
        ? meta.triggers.map(String)
        : Array.isArray(meta.keywords)
          ? meta.keywords.map(String)
          : [];
      const stacks = Array.isArray(meta.stacks) ? meta.stacks.map(String) : [];
      records.push({
        id,
        name: parsed.name || id,
        description: parsed.description || "Local skill",
        domains,
        stacks,
        triggers,
        sourceId: LOCAL_SOURCE_ID,
        path: relPath,
        priority: typeof meta.priority === "number" ? Math.min(10, Math.max(0, meta.priority)) : 5,
        cacheStatus: "cached",
        contentHash: hash,
        lastSyncedAt: new Date().toISOString(),
        trustStatus: "unreviewed",
        kind: "skill",
        licenseHint: typeof meta.license === "string" ? meta.license : undefined,
        reviewNotes: "Imported from local directory — treat as untrusted.",
      });
      skillIds.push(id);
    }
  }

  // Deduplicate by id (last wins)
  const byId = new Map(records.map((r) => [r.id, r]));
  reg = upsertSkills(reg, [...byId.values()]);
  saveRegistry(projectRoot, reg);

  return {
    registry: reg,
    result: {
      sourceId: LOCAL_SOURCE_ID,
      discovered: skillIds.length,
      registered: byId.size,
      skillIds: [...byId.keys()],
      warnings,
    },
  };
}
