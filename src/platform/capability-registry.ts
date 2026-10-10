import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { atomicWriteJson, ensureOmniDirs, paths } from "../core/config.js";
import { OmniError } from "../core/errors.js";
import type { CapabilityRecord, CapabilityRegistryDoc, LifecycleStatus } from "./types.js";

export const CAPABILITY_REGISTRY_FILE = "capability-registry.json";

const ProvenanceSchema = z.object({
  source: z.string(),
  url: z.string().optional(),
  licenseHint: z.string().optional(),
  importedAt: z.string().optional(),
  verified: z.boolean(),
  notes: z.string().optional(),
});

const CapabilitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["skill", "tool", "model", "workflow", "agent"]),
  name: z.string().min(1),
  description: z.string(),
  status: z.enum([
    "discovered",
    "installed",
    "configured",
    "available",
    "executed",
    "verified",
    "unavailable",
    "blocked",
  ]),
  io: z.object({ inputs: z.array(z.string()), outputs: z.array(z.string()) }),
  dependencies: z.array(z.string()),
  permissions: z.array(
    z.enum([
      "filesystem_read",
      "filesystem_write",
      "network",
      "shell",
      "spend_money",
      "publish",
      "destructive",
    ]),
  ),
  provenance: ProvenanceSchema,
  executionMethod: z.enum(["none", "shell", "adapter", "agent", "http"]).optional(),
  adapterId: z.string().optional(),
  verification: z.string().optional(),
  tags: z.array(z.string()),
  meta: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

const DocSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string(),
  capabilities: z.array(CapabilitySchema),
});

export function capRegFile(projectRoot: string): string {
  return join(paths(projectRoot).root, CAPABILITY_REGISTRY_FILE);
}

export function emptyCapabilityRegistry(): CapabilityRegistryDoc {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), capabilities: [] };
}

export function loadCapabilityRegistry(projectRoot: string): CapabilityRegistryDoc {
  const file = capRegFile(projectRoot);
  if (!existsSync(file)) return emptyCapabilityRegistry();
  try {
    return DocSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch (err) {
    throw new OmniError(
      "CAPABILITY_REGISTRY_INVALID",
      `Invalid capability registry: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function saveCapabilityRegistry(projectRoot: string, doc: CapabilityRegistryDoc): void {
  ensureOmniDirs(projectRoot);
  const parsed = DocSchema.parse({ ...doc, updatedAt: new Date().toISOString() });
  atomicWriteJson(capRegFile(projectRoot), parsed);
}

export function upsertCapability(
  doc: CapabilityRegistryDoc,
  record: CapabilityRecord,
): CapabilityRegistryDoc {
  const rest = doc.capabilities.filter((c) => c.id !== record.id);
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    capabilities: [...rest, record],
  };
}

export function setCapabilityStatus(
  doc: CapabilityRegistryDoc,
  id: string,
  status: LifecycleStatus,
): CapabilityRegistryDoc {
  return {
    ...doc,
    capabilities: doc.capabilities.map((c) => (c.id === id ? { ...c, status } : c)),
    updatedAt: new Date().toISOString(),
  };
}

/** Seed built-in capability metadata (status must be probed before "available"). */
export function builtinCapabilitySeeds(): CapabilityRecord[] {
  return [
    {
      id: "tool.ffmpeg",
      kind: "tool",
      name: "FFmpeg",
      description: "Local media conversion, trim, concat, filters, subtitles, encoding.",
      status: "discovered",
      io: { inputs: ["media files", "filter graphs"], outputs: ["audio", "video", "subtitles"] },
      dependencies: [],
      permissions: ["filesystem_read", "filesystem_write", "shell"],
      provenance: { source: "omniskill-builtin", verified: false, notes: "Probe required" },
      executionMethod: "adapter",
      adapterId: "media.ffmpeg",
      verification: "ffprobe streams + file exists",
      tags: ["media", "video", "audio"],
      meta: {},
    },
    {
      id: "tool.ffprobe",
      kind: "tool",
      name: "FFprobe",
      description: "Inspect media containers and streams.",
      status: "discovered",
      io: { inputs: ["media files"], outputs: ["json metadata"] },
      dependencies: ["tool.ffmpeg"],
      permissions: ["filesystem_read", "shell"],
      provenance: { source: "omniskill-builtin", verified: false },
      executionMethod: "adapter",
      adapterId: "media.ffmpeg",
      tags: ["media"],
      meta: {},
    },
    {
      id: "tool.blender",
      kind: "tool",
      name: "Blender",
      description: "3D / compositing / rendering when installed (adapter stub).",
      status: "unavailable",
      io: { inputs: ["blend projects"], outputs: ["renders"] },
      dependencies: [],
      permissions: ["filesystem_read", "filesystem_write", "shell"],
      provenance: {
        source: "omniskill-builtin",
        verified: false,
        notes: "Stub — not probed in foundation",
      },
      executionMethod: "adapter",
      adapterId: "media.blender",
      tags: ["media", "3d"],
      meta: {},
    },
    {
      id: "agent.portable",
      kind: "agent",
      name: "Portable Markdown agent",
      description: "Exports guidance bundles; does not auto-execute agent actions.",
      status: "available",
      io: { inputs: ["task", "skills"], outputs: ["markdown bundle"] },
      dependencies: [],
      permissions: ["filesystem_write"],
      provenance: { source: "omniskill-core", verified: true, notes: "Instruction export only" },
      executionMethod: "none",
      tags: ["agent"],
      meta: {},
    },
    {
      id: "workflow.engine",
      kind: "workflow",
      name: "OmniSkill workflow engine",
      description: "Dependency-aware staged execution with approval gates.",
      status: "available",
      io: { inputs: ["workflow plan"], outputs: ["job state", "artifacts"] },
      dependencies: [],
      permissions: ["filesystem_write"],
      provenance: { source: "omniskill-core", verified: true },
      executionMethod: "adapter",
      adapterId: "execution.engine",
      tags: ["workflow"],
      meta: {},
    },
  ];
}

export function ensureCapabilityRegistry(projectRoot: string): CapabilityRegistryDoc {
  let doc = loadCapabilityRegistry(projectRoot);
  if (doc.capabilities.length === 0) {
    for (const seed of builtinCapabilitySeeds()) doc = upsertCapability(doc, seed);
    saveCapabilityRegistry(projectRoot, doc);
  }
  return doc;
}
