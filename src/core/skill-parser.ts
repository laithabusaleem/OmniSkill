import type { ParsedSkill } from "../types/index.js";
import { OmniError } from "./errors.js";
import { assertSafeRelativePath, assertSafeYamlKey } from "./security.js";

function parseSimpleYaml(frontmatter: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = frontmatter.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  const flushList = () => {
    if (currentKey && currentList) {
      result[currentKey] = currentList;
    }
    currentKey = null;
    currentList = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentList) {
      currentList.push(stripQuotes(listItem[1]!.trim()));
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) {
      flushList();
      continue;
    }
    flushList();
    const key = kv[1]!;
    assertSafeYamlKey(key);
    const value = kv[2]!.trim();
    if (value === "" || value === "|" || value === ">") {
      currentKey = key;
      currentList = [];
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      result[key] = inner
        ? inner.split(",").map((s) => stripQuotes(s.trim())).filter(Boolean)
        : [];
      continue;
    }
    result[key] = coerceScalar(stripQuotes(value));
  }
  flushList();
  return result;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function coerceScalar(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function extractReferences(body: string): string[] {
  const refs = new Set<string>();
  const mdLink = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLink.exec(body)) !== null) {
    const href = m[2]!.trim();
    if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("#") || href.startsWith("mailto:")) {
      continue;
    }
    try {
      refs.add(assertSafeRelativePath(href.split("#")[0]!, "reference"));
    } catch {
      // skip unsafe refs; caller may warn
    }
  }
  return [...refs];
}

export function parseSkillMarkdown(content: string): ParsedSkill {
  if (!content || !content.trim()) {
    throw new OmniError("SKILL_PARSE", "Skill content is empty.");
  }

  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
  if (!fmMatch) {
    throw new OmniError("SKILL_PARSE", "Missing YAML frontmatter delimited by ---.");
  }

  const frontmatterRaw = fmMatch[1]!;
  const body = fmMatch[2] ?? "";
  let metadata: Record<string, unknown>;
  try {
    metadata = parseSimpleYaml(frontmatterRaw);
  } catch (err) {
    if (err instanceof OmniError) throw err;
    throw new OmniError("SKILL_PARSE", `Malformed frontmatter: ${err instanceof Error ? err.message : String(err)}`);
  }

  const name = typeof metadata.name === "string" ? metadata.name.trim() : "";
  const description = typeof metadata.description === "string" ? metadata.description.trim() : "";
  if (!name) {
    throw new OmniError("SKILL_PARSE", "Skill frontmatter requires `name`.");
  }
  if (!description) {
    throw new OmniError("SKILL_PARSE", "Skill frontmatter requires `description`.");
  }

  return {
    name,
    description,
    metadata: {
      ...metadata,
      domains: asStringArray(metadata.domains ?? metadata.domain),
      stacks: asStringArray(metadata.stacks ?? metadata.stack),
      triggers: asStringArray(metadata.triggers ?? metadata.trigger ?? metadata.keywords),
    },
    body,
    frontmatterRaw,
    references: extractReferences(body),
  };
}
