import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { z } from "zod";
import type { ContextEntry, ContextFactKind, DomainId, ProjectContext } from "../types/index.js";
import { atomicWriteJson, loadConfig, paths, saveConfig } from "./config.js";
import { OmniError } from "./errors.js";

const EntrySchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1).max(120),
  value: z.string().max(8000),
  kind: z.enum(["user_fact", "external_evidence", "ai_assumption"]),
  domain: z
    .enum(["software", "business", "writing", "social", "research", "design", "education", "general"])
    .optional(),
  sourceRef: z.string().max(500).optional(),
  updatedAt: z.string(),
});

const ContextSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  updatedAt: z.string(),
  entries: z.array(EntrySchema),
});

function emptyContext(enabled: boolean): ProjectContext {
  return {
    schemaVersion: 1,
    enabled,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

export function loadProjectContext(projectRoot: string): ProjectContext {
  const cfg = loadConfig(projectRoot);
  const file = paths(projectRoot).context;
  if (!existsSync(file)) {
    return emptyContext(cfg.context.enabled);
  }
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return ContextSchema.parse(raw);
  } catch (err) {
    throw new OmniError(
      "CONTEXT_INVALID",
      `Invalid project context: ${err instanceof Error ? err.message : String(err)}`,
      { hint: "Fix or delete .omni/context.json." },
    );
  }
}

export function saveProjectContext(projectRoot: string, ctx: ProjectContext): void {
  const parsed = ContextSchema.parse(ctx);
  atomicWriteJson(paths(projectRoot).context, parsed);
}

export function enableProjectContext(projectRoot: string, enabled: boolean): ProjectContext {
  const config = loadConfig(projectRoot);
  config.context.enabled = enabled;
  saveConfig(projectRoot, config);
  const ctx = loadProjectContext(projectRoot);
  ctx.enabled = enabled;
  ctx.updatedAt = new Date().toISOString();
  saveProjectContext(projectRoot, ctx);
  return ctx;
}

export function upsertContextEntry(
  projectRoot: string,
  input: {
    key: string;
    value: string;
    kind: ContextFactKind;
    domain?: DomainId;
    sourceRef?: string;
    overwrite?: boolean;
  },
): ProjectContext {
  const config = loadConfig(projectRoot);
  if (!config.context.enabled) {
    throw new OmniError("CONTEXT_DISABLED", "Project context is disabled.", {
      hint: "Run `omniskill context --enable` (opt-in).",
    });
  }
  const ctx = loadProjectContext(projectRoot);
  ctx.enabled = true;
  const existing = ctx.entries.find((e) => e.key === input.key);
  if (existing && existing.kind === "user_fact" && input.kind !== "user_fact" && !input.overwrite) {
    throw new OmniError(
      "CONTEXT_PROTECTED",
      `Refusing to overwrite user_fact "${input.key}" with ${input.kind}.`,
      { hint: "Pass --overwrite to replace deliberately." },
    );
  }
  if (existing && !input.overwrite && existing.value !== input.value) {
    throw new OmniError(
      "CONTEXT_EXISTS",
      `Context key "${input.key}" already exists.`,
      { hint: "Use --overwrite to replace, or delete the key first." },
    );
  }
  const entry: ContextEntry = {
    id: existing?.id ?? `ctx_${Date.now().toString(36)}`,
    key: input.key,
    value: input.value,
    kind: input.kind,
    domain: input.domain,
    sourceRef: input.sourceRef,
    updatedAt: new Date().toISOString(),
  };
  ctx.entries = [...ctx.entries.filter((e) => e.key !== input.key), entry];
  ctx.updatedAt = entry.updatedAt;
  saveProjectContext(projectRoot, ctx);
  return ctx;
}

export function deleteContextEntry(projectRoot: string, key: string): ProjectContext {
  const ctx = loadProjectContext(projectRoot);
  const before = ctx.entries.length;
  ctx.entries = ctx.entries.filter((e) => e.key !== key);
  if (ctx.entries.length === before) {
    throw new OmniError("CONTEXT_NOT_FOUND", `No context entry with key "${key}".`);
  }
  ctx.updatedAt = new Date().toISOString();
  saveProjectContext(projectRoot, ctx);
  return ctx;
}

export function clearProjectContext(projectRoot: string): void {
  const file = paths(projectRoot).context;
  if (existsSync(file)) unlinkSync(file);
}

export function exportContextMarkdown(ctx: ProjectContext): string {
  const lines = [
    "# OmniSkill project context",
    "",
    `Enabled: ${ctx.enabled}`,
    `Updated: ${ctx.updatedAt}`,
    "",
  ];
  if (ctx.entries.length === 0) {
    lines.push("_No entries._");
    return `${lines.join("\n")}\n`;
  }
  for (const e of ctx.entries) {
    lines.push(`## ${e.key}`);
    lines.push("");
    lines.push(`- Kind: \`${e.kind}\``);
    if (e.domain) lines.push(`- Domain: ${e.domain}`);
    if (e.sourceRef) lines.push(`- Source: ${e.sourceRef}`);
    lines.push(`- Updated: ${e.updatedAt}`);
    lines.push("");
    lines.push(e.value);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/** Context relevant to a domain set — never dumps entire project files. */
export function selectContextForDomains(ctx: ProjectContext, domains: string[], limit = 12): ContextEntry[] {
  if (!ctx.enabled) return [];
  const wanted = new Set(domains.map((d) => d.toLowerCase()));
  const scored = ctx.entries.map((e) => {
    let score = 1;
    if (e.domain && wanted.has(e.domain)) score += 5;
    if (e.kind === "user_fact") score += 2;
    if (e.kind === "ai_assumption") score -= 1;
    return { e, score };
  });
  scored.sort((a, b) => b.score - a.score || a.e.key.localeCompare(b.e.key));
  return scored.slice(0, limit).map((x) => x.e);
}
