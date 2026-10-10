import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { paths } from "./config.js";
import { OmniError } from "./errors.js";
import { assertNotSymlink, contentHash, resolveInsideRoot } from "./security.js";

export function skillCacheDir(projectRoot: string, skillId: string): string {
  const safeId = skillId.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "_");
  if (!safeId || safeId === "." || safeId === "..") {
    throw new OmniError("PATH_UNSAFE", `Invalid skill id for cache path: ${skillId}`);
  }
  const dir = join(paths(projectRoot).skills, safeId);
  const skillsRoot = resolve(paths(projectRoot).skills);
  const resolvedDir = resolve(dir);
  if (resolvedDir !== skillsRoot && !resolvedDir.startsWith(skillsRoot + sep)) {
    throw new OmniError("PATH_UNSAFE", `Skill cache path escapes skills root: ${skillId}`);
  }
  return dir;
}

export function skillCachePath(projectRoot: string, skillId: string): string {
  return join(skillCacheDir(projectRoot, skillId), "SKILL.md");
}

export function readCachedSkill(projectRoot: string, skillId: string): string | null {
  const file = skillCachePath(projectRoot, skillId);
  if (!existsSync(file)) return null;
  assertNotSymlink(file, "cached skill");
  return readFileSync(file, "utf8");
}

export interface CacheIntegrityResult {
  content: string | null;
  ok: boolean;
  reason?: string;
}

/** Read cached skill and verify sha256 against meta.json when present. */
export function readCachedSkillVerified(projectRoot: string, skillId: string): CacheIntegrityResult {
  const content = readCachedSkill(projectRoot, skillId);
  if (content === null) {
    return { content: null, ok: false, reason: "missing" };
  }
  const metaFile = cacheMetaPath(projectRoot, skillId);
  if (!existsSync(metaFile)) {
    return { content, ok: true, reason: "no-meta" };
  }
  try {
    assertNotSymlink(metaFile, "cache meta");
    const meta = JSON.parse(readFileSync(metaFile, "utf8")) as { contentHash?: string };
    if (!meta.contentHash) {
      return { content, ok: true, reason: "no-hash" };
    }
    const actual = contentHash(content);
    if (actual !== meta.contentHash) {
      return {
        content: null,
        ok: false,
        reason: `hash-mismatch expected=${meta.contentHash.slice(0, 12)} actual=${actual.slice(0, 12)}`,
      };
    }
    return { content, ok: true };
  } catch (err) {
    return {
      content: null,
      ok: false,
      reason: err instanceof Error ? err.message : "meta-error",
    };
  }
}

export function writeCachedSkill(projectRoot: string, skillId: string, content: string): string {
  const file = skillCachePath(projectRoot, skillId);
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  assertNotSymlink(dir, "skill cache directory");
  if (existsSync(file)) {
    assertNotSymlink(file, "cached skill");
  }
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, file);
  return contentHash(content);
}

export function cacheMetaPath(projectRoot: string, skillId: string): string {
  return join(skillCacheDir(projectRoot, skillId), "meta.json");
}

export function writeCacheMeta(
  projectRoot: string,
  skillId: string,
  meta: { sourceId: string; path: string; contentHash: string; syncedAt: string },
): void {
  const file = cacheMetaPath(projectRoot, skillId);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
}

export function resolveSkillResource(
  projectRoot: string,
  skillId: string,
  relPath: string,
): string {
  const root = skillCacheDir(projectRoot, skillId);
  return resolveInsideRoot(root, relPath);
}
