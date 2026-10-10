import type { OmniConfig } from "../types/index.js";
import { defaultConfig } from "./config.js";
import { OmniError } from "./errors.js";
import {
  assertResponseSize,
  assertSafeRelativePath,
  isTrustedGitHubHost,
  parseGitHubRepo,
  type RepoRef,
} from "./security.js";

export interface FetchOptions {
  token?: string;
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree" | string;
  sha: string;
  size?: number;
  url?: string;
}

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "omniskill-cli",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchWithLimits(
  url: string,
  options: FetchOptions,
): Promise<{ status: number; headers: Headers; text: string }> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? defaultConfig().network.timeoutMs;
  const maxBytes = options.maxBytes ?? defaultConfig().network.maxResponseBytes;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      headers: authHeaders(options.token),
      signal: controller.signal,
      redirect: "follow",
    });

    if (res.url) {
      const finalHost = new URL(res.url).hostname;
      if (!isTrustedGitHubHost(finalHost)) {
        throw new OmniError("REDIRECT_UNTRUSTED", `Unexpected redirect host: ${finalHost}`, {
          hint: "OmniSkill only follows redirects to trusted GitHub hosts.",
        });
      }
    }

    if (res.status === 404) {
      throw new OmniError("GITHUB_NOT_FOUND", `GitHub resource not found: ${url}`, {
        hint: "Check owner/repo and that the repository is public (or provide GITHUB_TOKEN).",
      });
    }
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      throw new OmniError("GITHUB_RATE_LIMIT", "GitHub rate limit or forbidden response.", {
        hint:
          remaining === "0" || res.status === 429
            ? "Set GITHUB_TOKEN for higher rate limits, or retry later."
            : "Check token permissions or repository visibility.",
      });
    }
    if (!res.ok) {
      throw new OmniError("GITHUB_HTTP", `GitHub HTTP ${res.status} for ${url}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    assertResponseSize(buf.byteLength, maxBytes);
    return { status: res.status, headers: res.headers, text: buf.toString("utf8") };
  } catch (err) {
    if (err instanceof OmniError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OmniError("GITHUB_TIMEOUT", `Request timed out after ${timeoutMs}ms: ${url}`, {
        hint: "Retry when the network is available, or use cached skills offline.",
      });
    }
    throw new OmniError("GITHUB_NETWORK", `Network error: ${err instanceof Error ? err.message : String(err)}`, {
      hint: "Continue offline with cached registry data if available.",
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRepoTree(
  ref: RepoRef,
  options: FetchOptions = {},
): Promise<TreeEntry[]> {
  const metaUrl = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;
  const meta = await fetchWithLimits(metaUrl, options);
  const repoInfo = JSON.parse(meta.text) as { default_branch?: string };
  const branch = repoInfo.default_branch ?? "main";

  const treeUrl = `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const treeRes = await fetchWithLimits(treeUrl, { ...options, maxBytes: options.maxBytes ?? 5_000_000 });
  const body = JSON.parse(treeRes.text) as { truncated?: boolean; tree?: TreeEntry[] };
  if (!body.tree) {
    throw new OmniError("GITHUB_TREE", "Git Trees API response missing tree array.");
  }
  if (body.truncated) {
    // Still usable; report via caller if needed
  }
  return body.tree;
}

export async function fetchFileRaw(
  ref: RepoRef,
  path: string,
  options: FetchOptions = {},
): Promise<string> {
  const safePath = assertSafeRelativePath(path, "skill path");
  const url = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/HEAD/${safePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const res = await fetchWithLimits(url, options);
  return res.text;
}

export function discoverSkillPaths(tree: TreeEntry[]): string[] {
  const out: string[] = [];
  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    const p = entry.path.replace(/\\/g, "/");
    if (!/(^|\/)SKILL\.md$/i.test(p) && !/(^|\/)\.claude\/skills\/.+\/SKILL\.md$/i.test(p)) {
      continue;
    }
    try {
      out.push(assertSafeRelativePath(p, "skill path"));
    } catch {
      // Drop traversal / absolute paths from discovery rather than fetching them.
    }
  }
  return out;
}

export function resolveRepoInput(input: string): RepoRef {
  return parseGitHubRepo(input);
}

export function networkOptionsFromConfig(config: OmniConfig, fetchImpl?: typeof fetch): FetchOptions {
  return {
    token: process.env.GITHUB_TOKEN,
    timeoutMs: config.network.timeoutMs,
    maxBytes: config.network.maxResponseBytes,
    fetchImpl,
  };
}
