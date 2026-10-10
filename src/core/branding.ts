import { createRequire } from "node:module";
import type { OmniConfig } from "../types/index.js";

export const PRODUCT_NAME = "OmniSkill";
export const PRODUCT_TAGLINE = "Project-aware AI skill router";

const require = createRequire(import.meta.url);

export interface PackageMeta {
  name?: string;
  version?: string;
  repository?: string | { type?: string; url?: string };
  homepage?: string;
}

export function readPackageMeta(): PackageMeta {
  try {
    return require("../../package.json") as PackageMeta;
  } catch {
    return {};
  }
}

/** Normalize git/https repository fields; return undefined when unknown (never invent). */
export function normalizeRepositoryUrl(raw: string | undefined | null): string | undefined {
  if (!raw || !raw.trim()) return undefined;
  let url = raw.trim();
  if (url.startsWith("git+")) url = url.slice(4);
  if (url.startsWith("git@github.com:")) {
    url = `https://github.com/${url.slice("git@github.com:".length).replace(/\.git$/i, "")}`;
  }
  url = url.replace(/\.git$/i, "");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/**
 * Resolve public repo URL from (in order): explicit override, config, env, package.json.
 * Returns undefined when no trusted URL is configured.
 */
export function resolveRepositoryUrl(
  config?: Pick<OmniConfig, "attribution">,
  pkg: PackageMeta = readPackageMeta(),
): string | undefined {
  const fromArg = normalizeRepositoryUrl(config?.attribution.repositoryUrl);
  if (fromArg) return fromArg;

  const fromEnv = normalizeRepositoryUrl(process.env.OMNISKILL_REPO_URL);
  if (fromEnv) return fromEnv;

  if (typeof pkg.repository === "string") {
    return normalizeRepositoryUrl(pkg.repository);
  }
  if (pkg.repository && typeof pkg.repository === "object") {
    const fromPkg = normalizeRepositoryUrl(pkg.repository.url);
    if (fromPkg) return fromPkg;
  }
  return normalizeRepositoryUrl(pkg.homepage);
}

export function formatAttributionFooter(
  config: Pick<OmniConfig, "attribution">,
  options: { enabled?: boolean; repositoryUrl?: string } = {},
): string | null {
  const enabled = options.enabled ?? config.attribution.enabled;
  if (!enabled) return null;

  const custom = config.attribution.footerText?.trim();
  if (custom) return custom;

  const url = options.repositoryUrl ?? resolveRepositoryUrl(config);
  if (url) {
    return `Generated with ${PRODUCT_NAME} · ${url}`;
  }
  return `Generated with ${PRODUCT_NAME}`;
}

/** HTML/Markdown-safe comment for OmniSkill-managed config when format allows. */
export function managedByComment(config: Pick<OmniConfig, "attribution">): string {
  const url = resolveRepositoryUrl(config);
  if (!config.attribution.enabled) {
    return "Managed by OmniSkill (attribution disabled).";
  }
  return url ? `Managed by OmniSkill · ${url}` : "Managed by OmniSkill.";
}

export function colorsEnabled(stream: NodeJS.WriteStream = process.stdout): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return false;
  if (process.env.FORCE_COLOR === "0") return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "") return true;
  return Boolean(stream.isTTY);
}

export function colorize(text: string, code: number, stream?: NodeJS.WriteStream): string {
  if (!colorsEnabled(stream)) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

/** Single-line identity for help header / human init — never for --json. */
export function cliIdentityLine(version?: string): string {
  const ver = version ?? readPackageMeta().version;
  const name = colorize(PRODUCT_NAME, 36);
  const tag = colorize(PRODUCT_TAGLINE, 90);
  return ver ? `${name} v${ver} — ${tag}` : `${name} — ${tag}`;
}

export function provenancePreamble(): string[] {
  return [
    "## Provenance",
    "",
    "This file was assembled by OmniSkill. Ownership of sections:",
    "",
    "- **OmniSkill-authored:** structure, security policy, provenance, and optional attribution footer.",
    "- **Third-party skills:** instruction bodies quoted below; copyright and license remain with their sources.",
    "- **User project:** profile summary derived from local scan metadata (not full source upload).",
    "",
    "OmniSkill does not claim ownership of third-party skill instructions.",
    "",
  ];
}
