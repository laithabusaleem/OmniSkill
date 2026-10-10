import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { OmniConfig } from "../types/index.js";
import { OmniError } from "./errors.js";

export const OMNI_DIR = ".omni";
export const PROFILE_FILE = "profile.json";
export const REGISTRY_FILE = "skill-registry.json";
export const CONFIG_FILE = "config.json";
export const LOG_FILE = "log.jsonl";
export const SKILLS_DIR = "skills";
export const BUNDLES_DIR = "bundles";
export const BACKUPS_DIR = "backups";
export const CONTEXT_FILE = "context.json";
export const PLANS_DIR = "plans";

export const OmniConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  agent: z.enum(["claude-code", "cursor", "portable"]).default("claude-code"),
  privacy: z
    .object({
      logRawTask: z.boolean().default(false),
    })
    .default({ logRawTask: false }),
  matching: z
    .object({
      maxSkills: z.number().int().min(1).max(20).default(5),
      minScore: z.number().min(0).max(100).default(18),
    })
    .default({ maxSkills: 5, minScore: 18 }),
  bundle: z
    .object({
      maxChars: z.number().int().min(1000).default(48_000),
    })
    .default({ maxChars: 48_000 }),
  network: z
    .object({
      timeoutMs: z.number().int().min(1000).default(15_000),
      maxResponseBytes: z.number().int().min(1024).default(1_048_576),
    })
    .default({ timeoutMs: 15_000, maxResponseBytes: 1_048_576 }),
  attribution: z
    .object({
      enabled: z.boolean().default(true),
      repositoryUrl: z.string().url().optional(),
      footerText: z.string().max(240).optional(),
    })
    .default({ enabled: true }),
  discovery: z
    .object({
      localSkillDirs: z.array(z.string()).default([]),
      allowUnreviewedAutoSelect: z.boolean().default(true),
    })
    .default({ localSkillDirs: [], allowUnreviewedAutoSelect: true }),
  context: z
    .object({
      enabled: z.boolean().default(false),
    })
    .default({ enabled: false }),
  orchestration: z
    .object({
      autoClassifyOnMatch: z.boolean().default(true),
    })
    .default({ autoClassifyOnMatch: true }),
});

export function defaultConfig(): OmniConfig {
  return OmniConfigSchema.parse({ schemaVersion: 1 });
}

export function omniRoot(projectRoot: string): string {
  return join(resolve(projectRoot), OMNI_DIR);
}

export function paths(projectRoot: string) {
  const root = omniRoot(projectRoot);
  return {
    root,
    profile: join(root, PROFILE_FILE),
    registry: join(root, REGISTRY_FILE),
    config: join(root, CONFIG_FILE),
    log: join(root, LOG_FILE),
    skills: join(root, SKILLS_DIR),
    bundles: join(root, BUNDLES_DIR),
    backups: join(root, BACKUPS_DIR),
    context: join(root, CONTEXT_FILE),
    plans: join(root, PLANS_DIR),
  };
}

export function ensureOmniDirs(projectRoot: string): void {
  const p = paths(projectRoot);
  for (const dir of [p.root, p.skills, p.bundles, p.backups, p.plans]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function atomicWriteJson(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tmp, filePath);
}

export function atomicWriteText(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, filePath);
}

export function loadConfig(projectRoot: string): OmniConfig {
  const file = paths(projectRoot).config;
  if (!existsSync(file)) {
    return defaultConfig();
  }
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return OmniConfigSchema.parse(raw);
  } catch (err) {
    throw new OmniError(
      "CONFIG_INVALID",
      `Invalid config at ${file}: ${err instanceof Error ? err.message : String(err)}`,
      { hint: "Fix .omni/config.json or delete it to restore defaults." },
    );
  }
}

export function saveConfig(projectRoot: string, config: OmniConfig): void {
  const parsed = OmniConfigSchema.parse(config);
  atomicWriteJson(paths(projectRoot).config, parsed);
}

export function requireOmniInitialized(projectRoot: string): void {
  const p = paths(projectRoot);
  if (!existsSync(p.root)) {
    throw new OmniError("NOT_INITIALIZED", "OmniSkill is not initialized in this project.", {
      hint: "Run `omniskill init` first.",
    });
  }
}
