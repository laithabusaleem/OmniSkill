import { describe, expect, it, vi } from "vitest";
import { discoverSkillPaths, fetchFileRaw, fetchRepoTree, resolveRepoInput } from "../../src/core/fetcher.js";
import { OmniError } from "../../src/core/errors.js";
import { addRepository } from "../../src/core/sync.js";
import { defaultConfig, ensureOmniDirs } from "../../src/core/config.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SkillRegistry } from "../../src/types/index.js";

function mockFetch(handler: (url: string) => { status: number; body: string; headers?: Record<string, string> }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const res = handler(url);
    return new Response(res.body, {
      status: res.status,
      headers: res.headers ?? { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("fetcher / acquisition", () => {
  it("rejects invalid repository identifier", () => {
    expect(() => resolveRepoInput("not a repo")).toThrow(OmniError);
  });

  it("discovers SKILL.md paths", () => {
    const paths = discoverSkillPaths([
      { path: "skills/foo/SKILL.md", type: "blob", sha: "1" },
      { path: "README.md", type: "blob", sha: "2" },
      { path: "skills/foo", type: "tree", sha: "3" },
    ]);
    expect(paths).toEqual(["skills/foo/SKILL.md"]);
  });

  it("handles 404", async () => {
    const fetchImpl = mockFetch(() => ({ status: 404, body: "missing" }));
    await expect(
      fetchRepoTree({ owner: "a", repo: "b", url: "https://github.com/a/b" }, { fetchImpl }),
    ).rejects.toThrow(/not found/i);
  });

  it("handles rate limiting", async () => {
    const fetchImpl = mockFetch(() => ({
      status: 403,
      body: "rate",
      headers: { "x-ratelimit-remaining": "0" },
    }));
    await expect(
      fetchRepoTree({ owner: "a", repo: "b", url: "https://github.com/a/b" }, { fetchImpl }),
    ).rejects.toThrow(/rate limit/i);
  });

  it("handles timeout", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }) as unknown as typeof fetch;
    await expect(
      fetchFileRaw({ owner: "a", repo: "b", url: "https://github.com/a/b" }, "SKILL.md", {
        fetchImpl,
        timeoutMs: 10,
      }),
    ).rejects.toThrow(/timed out/i);
  });

  it("handles oversized response", async () => {
    const fetchImpl = mockFetch(() => ({ status: 200, body: "x".repeat(1000) }));
    await expect(
      fetchFileRaw({ owner: "a", repo: "b", url: "https://github.com/a/b" }, "SKILL.md", {
        fetchImpl,
        maxBytes: 10,
      }),
    ).rejects.toThrow(/exceeds limit/i);
  });

  it("registers valid skills and skips malformed metadata", async () => {
    const root = join(tmpdir(), `omniskill-add-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    ensureOmniDirs(root);

    const skillGood = `---
name: good-skill
description: A valid skill
domains: [frontend]
stacks: [react]
triggers: [button]
---
# Good
`;
    const skillBad = `---
name: missing-desc
---
# Bad
`;

    const fetchImpl = mockFetch((url) => {
      if (url.includes("/repos/o/r") && !url.includes("/git/trees")) {
        return { status: 200, body: JSON.stringify({ default_branch: "main" }) };
      }
      if (url.includes("/git/trees/")) {
        return {
          status: 200,
          body: JSON.stringify({
            tree: [
              { path: "good/SKILL.md", type: "blob", sha: "1" },
              { path: "bad/SKILL.md", type: "blob", sha: "2" },
              { path: "../../../etc/passwd", type: "blob", sha: "3" },
            ],
          }),
        };
      }
      if (url.includes("good/SKILL.md")) return { status: 200, body: skillGood };
      if (url.includes("bad/SKILL.md")) return { status: 200, body: skillBad };
      return { status: 404, body: "no" };
    });

    const registry: SkillRegistry = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sources: [],
      skills: [],
    };

    const { summary, registry: next } = await addRepository(root, registry, "o/r", defaultConfig(), fetchImpl);
    expect(summary.discovered).toBeGreaterThanOrEqual(2);
    expect(next.skills.some((s) => s.name === "good-skill")).toBe(true);
    expect(summary.failed.length).toBeGreaterThan(0);
  });
});
