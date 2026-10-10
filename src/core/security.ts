import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { OmniError } from "./errors.js";

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

/** Exact trusted GitHub-related HTTP hosts (no suffix bypass). */
const TRUSTED_GITHUB_HTTP_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "media.githubusercontent.com",
  "codeload.github.com",
]);

export interface RepoRef {
  owner: string;
  repo: string;
  url: string;
}

export function isTrustedGitHubHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (TRUSTED_GITHUB_HTTP_HOSTS.has(host)) return true;
  // Dot-boundary only: foo.githubusercontent.com OK; evilgithubusercontent.com NOT OK
  if (host.endsWith(".githubusercontent.com") && host.length > ".githubusercontent.com".length) {
    return true;
  }
  return false;
}

export function parseGitHubRepo(input: string): RepoRef {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new OmniError("REPO_INVALID", "Repository identifier is empty.", {
      hint: "Use owner/repo or https://github.com/owner/repo",
    });
  }

  const ownerRepo = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/;
  const matchSimple = ownerRepo.exec(trimmed);
  if (matchSimple) {
    const owner = matchSimple[1]!;
    const repo = matchSimple[2]!;
    return { owner, repo, url: `https://github.com/${owner}/${repo}` };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new OmniError("REPO_INVALID", `Malformed repository identifier: ${trimmed}`, {
      hint: "Use owner/repo or a github.com HTTPS URL.",
    });
  }

  if (url.protocol !== "https:") {
    throw new OmniError("REPO_UNSUPPORTED_HOST", "Only HTTPS GitHub URLs are supported.");
  }
  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    throw new OmniError("REPO_UNSUPPORTED_HOST", `Unsupported host: ${url.hostname}`, {
      hint: "Only github.com repositories are accepted.",
    });
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new OmniError("REPO_INVALID", "GitHub URL must include owner and repository.");
  }
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, "");
  if (!ownerRepo.test(`${owner}/${repo}`)) {
    throw new OmniError("REPO_INVALID", `Invalid owner/repo in URL: ${owner}/${repo}`);
  }
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

export function assertSafeRelativePath(relPath: string, label = "path"): string {
  if (!relPath || relPath.trim() === "") {
    throw new OmniError("PATH_UNSAFE", `${label} is empty.`);
  }
  const normalized = normalize(relPath).replace(/\\/g, "/");
  if (isAbsolute(normalized) || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new OmniError("PATH_UNSAFE", `${label} must be a relative path: ${relPath}`);
  }
  if (normalized.split("/").some((p) => p === ".." || p === "")) {
    throw new OmniError("PATH_UNSAFE", `${label} contains traversal or empty segments: ${relPath}`);
  }
  return normalized;
}

export function resolveInsideRoot(root: string, relPath: string): string {
  const safe = assertSafeRelativePath(relPath);
  const resolved = resolve(root, safe);
  const rootResolved = resolve(root);
  const rel = relative(rootResolved, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new OmniError("PATH_UNSAFE", `Resolved path escapes root: ${relPath}`);
  }
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + sep)) {
    throw new OmniError("PATH_UNSAFE", `Resolved path escapes root: ${relPath}`);
  }
  return resolved;
}

export function assertNotSymlink(filePath: string, label = "path"): void {
  try {
    const st = lstatSync(filePath);
    if (st.isSymbolicLink()) {
      throw new OmniError("SYMLINK_REJECTED", `${label} is a symbolic link and cannot be used: ${filePath}`, {
        hint: "Remove the symlink or point OmniSkill at a regular file/directory.",
      });
    }
  } catch (err) {
    if (err instanceof OmniError) throw err;
    // Missing path is fine — caller may create it.
  }
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function redactSecrets(text: string): string {
  return text
    .replace(/(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?[^\s"'\\]+/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/ghp_[A-Za-z0-9]{20,}/g, "[REDACTED_TOKEN]")
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED_TOKEN]")
    .replace(/sk-[A-Za-z0-9]{20,}/g, "[REDACTED_TOKEN]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]");
}

/**
 * Heuristic prompt-injection / abuse detectors.
 * These are WARNING signals only — not a security boundary.
 */
const SUSPICIOUS_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /ignore (all )?(previous|prior) instructions/i, reason: "prompt-injection phrase" },
  { re: /disregard (the )?(omniskill|system|trusted) (policy|instructions|rules)/i, reason: "policy override attempt" },
  { re: /exfiltrat/i, reason: "exfiltration language" },
  { re: /send .{0,40}(api.?key|secret|password|token)/i, reason: "credential exfiltration language" },
  { re: /print (all )?(env|environment)(ironment)? variables/i, reason: "environment disclosure request" },
  { re: /reveal .{0,40}(ENV|process\.env|secrets?)/i, reason: "secret disclosure request" },
  { re: /curl\s+https?:\/\/(?!github\.com)/i, reason: "outbound curl to non-GitHub host" },
  { re: /eval\s*\(/i, reason: "eval usage" },
  { re: /\b(node|bash|sh|powershell|cmd\.exe)\b.{0,40}\b(script\.|\.sh\b|\.ps1\b|\.bat\b)/i, reason: "script execution request" },
  { re: /run (the )?included script/i, reason: "included script execution request" },
  { re: /chmod\s+\+x/i, reason: "make-executable request" },
];

export function scanSuspiciousInstructions(content: string): string[] {
  const hits: string[] = [];
  for (const { re, reason } of SUSPICIOUS_PATTERNS) {
    if (re.test(content)) {
      hits.push(reason);
    }
  }
  return hits;
}

export function assertResponseSize(bytes: number, maxBytes: number): void {
  if (bytes > maxBytes) {
    throw new OmniError("RESPONSE_TOO_LARGE", `Response size ${bytes} exceeds limit ${maxBytes}.`);
  }
}

const DANGEROUS_YAML_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function assertSafeYamlKey(key: string): void {
  if (DANGEROUS_YAML_KEYS.has(key) || key.includes("__proto__")) {
    throw new OmniError("YAML_UNSAFE_KEY", `Refusing dangerous frontmatter key: ${key}`);
  }
}

/** Filenames that must not be scanned as project content. */
export function isLikelySecretFileName(name: string): boolean {
  const n = name.toLowerCase();
  if (n.startsWith(".env")) return true;
  if (n === "credentials.json" || n === "secrets.json" || n === "service-account.json") return true;
  if (n.endsWith(".pem") || n.endsWith(".p12") || n.endsWith(".pfx") || n.endsWith(".key")) return true;
  if (n === "id_rsa" || n === "id_ed25519" || n.endsWith("_rsa")) return true;
  if (n.includes("secret") && (n.endsWith(".json") || n.endsWith(".txt") || n.endsWith(".yml"))) return true;
  return false;
}
