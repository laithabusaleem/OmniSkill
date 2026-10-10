import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { atomicWriteJson, ensureOmniDirs, paths } from "../core/config.js";
import type { ArtifactManifest, ArtifactRecord } from "./types.js";

export const ARTIFACTS_DIR = "artifacts";
export const ARTIFACT_MANIFEST = "artifacts.json";

const ArtifactSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum([
    "document",
    "code",
    "image",
    "audio",
    "video",
    "subtitle",
    "script",
    "storyboard",
    "manifest",
    "report",
    "dataset",
    "other",
  ]),
  path: z.string(),
  format: z.string().optional(),
  status: z.enum(["planned", "partial", "produced", "verified", "failed"]),
  producedBy: z.string().optional(),
  dependsOn: z.array(z.string()),
  provenance: z.string(),
  verifiedChecks: z.array(z.string()),
  createdAt: z.string(),
});

const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string(),
  artifacts: z.array(ArtifactSchema),
});

export function artifactsRoot(projectRoot: string): string {
  return join(paths(projectRoot).root, ARTIFACTS_DIR);
}

export function artifactManifestPath(projectRoot: string): string {
  return join(artifactsRoot(projectRoot), ARTIFACT_MANIFEST);
}

export function ensureArtifactDirs(projectRoot: string): void {
  ensureOmniDirs(projectRoot);
  mkdirSync(artifactsRoot(projectRoot), { recursive: true });
  mkdirSync(join(artifactsRoot(projectRoot), "media"), { recursive: true });
  mkdirSync(join(artifactsRoot(projectRoot), "docs"), { recursive: true });
  mkdirSync(join(artifactsRoot(projectRoot), "derived"), { recursive: true });
}

export function loadArtifactManifest(projectRoot: string): ArtifactManifest {
  const file = artifactManifestPath(projectRoot);
  if (!existsSync(file)) {
    return { schemaVersion: 1, updatedAt: new Date().toISOString(), artifacts: [] };
  }
  return ManifestSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export function saveArtifactManifest(projectRoot: string, manifest: ArtifactManifest): void {
  ensureArtifactDirs(projectRoot);
  atomicWriteJson(
    artifactManifestPath(projectRoot),
    ManifestSchema.parse({ ...manifest, updatedAt: new Date().toISOString() }),
  );
}

export function registerArtifact(projectRoot: string, artifact: ArtifactRecord): ArtifactManifest {
  const man = loadArtifactManifest(projectRoot);
  const next = {
    schemaVersion: 1 as const,
    updatedAt: new Date().toISOString(),
    artifacts: [...man.artifacts.filter((a) => a.id !== artifact.id), artifact],
  };
  saveArtifactManifest(projectRoot, next);
  return next;
}

export function derivedPath(projectRoot: string, ...parts: string[]): string {
  ensureArtifactDirs(projectRoot);
  return join(artifactsRoot(projectRoot), "derived", ...parts);
}
