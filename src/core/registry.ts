import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { SkillRecord, SkillRegistry, SkillSource, TrustStatus } from "../types/index.js";
import { atomicWriteJson, paths } from "./config.js";
import { OmniError } from "./errors.js";

const TrustStatusSchema = z.enum(["unreviewed", "reviewed", "trusted", "quarantined", "blocked"]);

const SkillSourceSchema = z.object({
  id: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  url: z.string().min(1),
  description: z.string().optional(),
  lastSyncedAt: z.string().optional(),
  trustStatus: TrustStatusSchema,
  kind: z.enum(["github", "local"]).optional(),
});

const SkillRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  domains: z.array(z.string()).default([]),
  stacks: z.array(z.string()).default([]),
  triggers: z.array(z.string()).default([]),
  sourceId: z.string().min(1),
  path: z.string().min(1),
  priority: z.number().min(0).max(10),
  cacheStatus: z.enum(["none", "cached", "stale", "error"]),
  contentHash: z.string().optional(),
  lastSyncedAt: z.string().optional(),
  reviewNotes: z.string().optional(),
  disabled: z.boolean().optional(),
  trustStatus: TrustStatusSchema.optional(),
  kind: z
    .enum(["skill", "prompt-template", "tool-integration", "repository-index", "application"])
    .optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  licenseHint: z.string().optional(),
});

export const SkillRegistrySchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    updatedAt: z.string(),
    sources: z.array(SkillSourceSchema),
    skills: z.array(SkillRecordSchema),
  })
  .superRefine((reg, ctx) => {
    const sourceIds = new Set(reg.sources.map((s) => s.id));
    const skillIds = new Set<string>();
    for (const skill of reg.skills) {
      if (skillIds.has(skill.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate skill id: ${skill.id}` });
      }
      skillIds.add(skill.id);
      if (!sourceIds.has(skill.sourceId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Skill ${skill.id} references missing source ${skill.sourceId}`,
        });
      }
    }
    const srcSeen = new Set<string>();
    for (const source of reg.sources) {
      if (srcSeen.has(source.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate source id: ${source.id}` });
      }
      srcSeen.add(source.id);
    }
  });

const CURRENT_SCHEMA = 1;

function seedPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "data", "seed-registry.json");
}

export function loadSeedRegistry(): SkillRegistry {
  const raw = JSON.parse(readFileSync(seedPath(), "utf8")) as unknown;
  return migrateAndValidate(raw);
}

export function migrateAndValidate(raw: unknown): SkillRegistry {
  if (!raw || typeof raw !== "object") {
    throw new OmniError("REGISTRY_INVALID", "Registry must be a JSON object.", {
      hint: "Do not delete and recreate blindly; restore from backup if available.",
    });
  }
  const obj = raw as Record<string, unknown>;
  let version = typeof obj.schemaVersion === "number" ? obj.schemaVersion : 0;

  // v0 → v1: ensure required fields
  if (version === 0) {
    obj.schemaVersion = 1;
    if (!obj.updatedAt) obj.updatedAt = new Date().toISOString();
    if (!Array.isArray(obj.sources)) obj.sources = [];
    if (!Array.isArray(obj.skills)) obj.skills = [];
    version = 1;
  }

  if (version !== CURRENT_SCHEMA) {
    throw new OmniError(
      "REGISTRY_UNSUPPORTED_VERSION",
      `Unsupported registry schemaVersion ${String(obj.schemaVersion)}. Supported: ${CURRENT_SCHEMA}.`,
    );
  }

  const parsed = SkillRegistrySchema.safeParse(obj);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new OmniError("REGISTRY_INVALID", `Registry validation failed: ${details}`, {
      hint: "Fix .omni/skill-registry.json manually. OmniSkill will not replace an invalid registry with defaults.",
    });
  }
  return parsed.data;
}

export function loadRegistry(projectRoot: string): SkillRegistry {
  const file = paths(projectRoot).registry;
  if (!existsSync(file)) {
    throw new OmniError("REGISTRY_MISSING", `Registry not found at ${file}`, {
      hint: "Run `omniskill init`.",
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch (err) {
    throw new OmniError("REGISTRY_CORRUPT", `Registry JSON is corrupt: ${err instanceof Error ? err.message : String(err)}`, {
      hint: "Restore from .omni/backups if available.",
    });
  }
  return migrateAndValidate(raw);
}

export function saveRegistry(projectRoot: string, registry: SkillRegistry): void {
  const validated = migrateAndValidate({ ...registry, updatedAt: new Date().toISOString() });
  atomicWriteJson(paths(projectRoot).registry, validated);
}

export function createSeededRegistry(): SkillRegistry {
  return loadSeedRegistry();
}

export function upsertSource(registry: SkillRegistry, source: SkillSource): SkillRegistry {
  const sources = registry.sources.filter((s) => s.id !== source.id);
  sources.push(source);
  return { ...registry, sources, updatedAt: new Date().toISOString() };
}

export function upsertSkills(registry: SkillRegistry, skills: SkillRecord[]): SkillRegistry {
  const map = new Map(registry.skills.map((s) => [s.id, s]));
  for (const skill of skills) {
    map.set(skill.id, skill);
  }
  return { ...registry, skills: [...map.values()], updatedAt: new Date().toISOString() };
}

export function sourceIdFor(owner: string, repo: string): string {
  return `${owner.toLowerCase()}__${repo.toLowerCase()}`;
}

export function skillIdFor(sourceId: string, relPath: string): string {
  const slug = relPath
    .replace(/\\/g, "/")
    .replace(/\/SKILL\.md$/i, "")
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/\//g, "__")
    .toLowerCase();
  return `${sourceId}__${slug}`;
}

export function effectiveTrust(skill: SkillRecord, sources: SkillSource[]): TrustStatus {
  if (skill.trustStatus) return skill.trustStatus;
  const source = sources.find((s) => s.id === skill.sourceId);
  return source?.trustStatus ?? "unreviewed";
}
