import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ProjectProfile } from "../types/index.js";
import { atomicWriteJson, paths } from "./config.js";
import { isLikelySecretFileName } from "./security.js";

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  ".omni",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  ".idea",
  ".vscode",
]);

function safeRead(filePath: string, max = 64_000): string | null {
  try {
    if (!existsSync(filePath)) return null;
    const st = statSync(filePath);
    if (!st.isFile() || st.size > max) return null;
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function fileExists(root: string, rel: string): boolean {
  return existsSync(join(root, rel));
}

function collectShallowFiles(root: string, maxFiles = 400): string[] {
  const out: string[] = [];
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

  while (stack.length > 0 && out.length < maxFiles) {
    const item = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(item.dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (out.length >= maxFiles) break;
      if (isLikelySecretFileName(name)) continue;
      const full = join(item.dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      const rel = relative(root, full).replace(/\\/g, "/");
      if (st.isDirectory()) {
        if (EXCLUDE_DIRS.has(name) || item.depth >= 3) continue;
        stack.push({ dir: full, depth: item.depth + 1 });
      } else if (st.isFile()) {
        out.push(rel);
      }
    }
  }
  return out;
}

function detectFromPackageJson(raw: string, profile: ProjectProfile): void {
  try {
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
      workspaces?: unknown;
      engines?: { node?: string };
    };
    profile.languages.push("javascript");
    profile.packageManagers.push("npm");
    if (pkg.engines?.node) profile.versions.node = pkg.engines.node;

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);

    if (has("typescript") || fileNameHint(deps, "typescript")) {
      profile.languages.push("typescript");
    }
    if (has("react") || has("react-dom")) profile.frameworks.push("react");
    if (has("next")) profile.frameworks.push("nextjs");
    if (has("vue")) profile.frameworks.push("vue");
    if (has("svelte") || has("@sveltejs/kit")) profile.frameworks.push("svelte");
    if (has("tailwindcss")) profile.frameworks.push("tailwindcss");
    if (has("express")) profile.frameworks.push("express");
    if (has("@nestjs/core")) profile.frameworks.push("nestjs");
    if (has("vitest")) profile.testRunners.push("vitest");
    if (has("jest")) profile.testRunners.push("jest");
    if (has("@playwright/test") || has("playwright")) profile.testRunners.push("playwright");
    if (has("cypress")) profile.testRunners.push("cypress");
    if (pkg.workspaces) profile.monorepo = true;
  } catch {
    profile.metadata.packageJsonParseError = "true";
  }
}

function fileNameHint(_deps: Record<string, string>, _name: string): boolean {
  return false;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.toLowerCase()))].sort();
}

export function scanProject(projectRoot: string): ProjectProfile {
  const root = projectRoot;
  const files = collectShallowFiles(root);
  const fileSet = new Set(files);

  const profile: ProjectProfile = {
    schemaVersion: 1,
    scannedAt: new Date().toISOString(),
    root,
    languages: [],
    frameworks: [],
    packageManagers: [],
    testRunners: [],
    ci: [],
    deployment: [],
    monorepo: false,
    metadata: {
      fileSampleCount: String(files.length),
    },
    versions: {},
  };

  const pkgRaw = safeRead(join(root, "package.json"));
  if (pkgRaw) detectFromPackageJson(pkgRaw, profile);

  if (fileExists(root, "pnpm-lock.yaml") || fileExists(root, "pnpm-workspace.yaml")) {
    profile.packageManagers.push("pnpm");
    if (fileExists(root, "pnpm-workspace.yaml")) profile.monorepo = true;
  }
  if (fileExists(root, "yarn.lock")) profile.packageManagers.push("yarn");
  if (fileExists(root, "bun.lockb") || fileExists(root, "bun.lock")) profile.packageManagers.push("bun");
  if (fileExists(root, "package-lock.json")) profile.packageManagers.push("npm");

  if (fileExists(root, "pyproject.toml") || fileExists(root, "requirements.txt") || fileExists(root, "setup.py")) {
    profile.languages.push("python");
    profile.packageManagers.push("pip");
  }
  const pyproject = safeRead(join(root, "pyproject.toml"));
  if (pyproject) {
    if (/fastapi/i.test(pyproject)) profile.frameworks.push("fastapi");
    if (/django/i.test(pyproject)) profile.frameworks.push("django");
    if (/pytest/i.test(pyproject)) profile.testRunners.push("pytest");
  }
  if (fileExists(root, "manage.py")) profile.frameworks.push("django");
  if (fileSet.has("pytest.ini") || files.some((f) => f.includes("tests/") && f.endsWith(".py"))) {
    if (!profile.testRunners.includes("pytest") && profile.languages.includes("python")) {
      profile.testRunners.push("pytest");
    }
  }

  if (fileExists(root, "go.mod")) {
    profile.languages.push("go");
    profile.packageManagers.push("go");
  }
  if (fileExists(root, "Cargo.toml")) {
    profile.languages.push("rust");
    profile.packageManagers.push("cargo");
  }
  if (fileExists(root, "Gemfile")) {
    profile.languages.push("ruby");
    profile.packageManagers.push("bundler");
  }
  if (fileExists(root, "composer.json")) {
    profile.languages.push("php");
    profile.packageManagers.push("composer");
  }

  if (fileExists(root, "tsconfig.json")) {
    if (!profile.languages.includes("typescript")) profile.languages.push("typescript");
  }

  if (files.some((f) => f.startsWith(".github/workflows/"))) profile.ci.push("github-actions");
  if (fileExists(root, ".gitlab-ci.yml")) profile.ci.push("gitlab-ci");
  if (fileExists(root, "Dockerfile") || fileExists(root, "docker-compose.yml") || fileExists(root, "compose.yaml")) {
    profile.deployment.push("docker");
  }
  if (fileExists(root, "vercel.json") || fileSet.has(".vercel/project.json")) {
    profile.deployment.push("vercel");
  }

  if (
    fileExists(root, "pnpm-workspace.yaml") ||
    fileExists(root, "lerna.json") ||
    fileExists(root, "nx.json") ||
    fileExists(root, "turbo.json")
  ) {
    profile.monorepo = true;
  }

  const readme = safeRead(join(root, "README.md"), 16_000);
  if (readme) {
    if (/next\.js|nextjs/i.test(readme) && !profile.frameworks.includes("nextjs")) {
      profile.metadata.readmeMentionsNext = "true";
    }
  }

  profile.languages = uniq(profile.languages);
  profile.frameworks = uniq(profile.frameworks);
  profile.packageManagers = uniq(profile.packageManagers);
  profile.testRunners = uniq(profile.testRunners);
  profile.ci = uniq(profile.ci);
  profile.deployment = uniq(profile.deployment);

  return profile;
}

export function writeProfile(projectRoot: string, profile: ProjectProfile): void {
  atomicWriteJson(paths(projectRoot).profile, profile);
}

export function loadProfile(projectRoot: string): ProjectProfile | null {
  const file = paths(projectRoot).profile;
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ProjectProfile;
  } catch {
    return null;
  }
}
