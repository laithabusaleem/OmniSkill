import { vi } from "vitest";

export type MockHandler = (url: string, init?: RequestInit) => {
  status: number;
  body: string;
  headers?: Record<string, string>;
  url?: string;
};

export function mockFetch(handler: MockHandler): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const res = handler(url, init);
    const response = new Response(res.body, {
      status: res.status,
      headers: res.headers ?? { "content-type": "application/json" },
    });
    if (res.url !== undefined) {
      Object.defineProperty(response, "url", { value: res.url, configurable: true });
    } else {
      Object.defineProperty(response, "url", { value: url, configurable: true });
    }
    return response;
  }) as unknown as typeof fetch;
}

export function githubSkillFixture(opts: {
  owner?: string;
  repo?: string;
  skills?: Array<{ path: string; content: string }>;
  statusMeta?: number;
  redirectUrl?: string;
}): typeof fetch {
  const owner = opts.owner ?? "acme";
  const repo = opts.repo ?? "skills";
  const skills = opts.skills ?? [];

  return mockFetch((url) => {
    if (opts.redirectUrl && url.includes(`/repos/${owner}/${repo}`) && !url.includes("/git/trees")) {
      return { status: 200, body: "{}", url: opts.redirectUrl };
    }
    if (url.includes(`/repos/${owner}/${repo}`) && !url.includes("/git/trees")) {
      return {
        status: opts.statusMeta ?? 200,
        body: JSON.stringify({ default_branch: "main" }),
      };
    }
    if (url.includes("/git/trees/")) {
      return {
        status: 200,
        body: JSON.stringify({
          tree: skills.map((s, i) => ({ path: s.path, type: "blob", sha: String(i + 1) })),
        }),
      };
    }
    for (const skill of skills) {
      if (url.includes(skill.path.split("/").map(encodeURIComponent).join("/")) || url.includes(skill.path)) {
        return { status: 200, body: skill.content };
      }
    }
    return { status: 404, body: "missing" };
  });
}
