import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { scanProject } from "../../src/core/scanner.js";

function tempProject(name: string): string {
  const root = join(tmpdir(), `omniskill-scan-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  return root;
}

describe("scanner", () => {
  it("handles empty repository", () => {
    const root = tempProject("empty");
    const profile = scanProject(root);
    expect(profile.languages).toEqual([]);
    expect(profile.frameworks).toEqual([]);
    expect(profile.schemaVersion).toBe(1);
  });

  it("detects TypeScript/Next/Vitest project", () => {
    const root = tempProject("ts");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "demo",
        dependencies: { next: "14.0.0", react: "18.0.0" },
        devDependencies: { typescript: "5.0.0", vitest: "3.0.0", tailwindcss: "3.0.0" },
      }),
    );
    writeFileSync(join(root, "tsconfig.json"), "{}");
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".github", "workflows", "ci.yml"), "name: ci\n");
    const profile = scanProject(root);
    expect(profile.languages).toContain("typescript");
    expect(profile.frameworks).toContain("nextjs");
    expect(profile.frameworks).toContain("react");
    expect(profile.frameworks).toContain("tailwindcss");
    expect(profile.testRunners).toContain("vitest");
    expect(profile.ci).toContain("github-actions");
  });

  it("detects Python FastAPI project", () => {
    const root = tempProject("py");
    writeFileSync(join(root, "pyproject.toml"), '[project]\ndependencies=["fastapi","pytest"]\n');
    writeFileSync(join(root, "requirements.txt"), "fastapi\n");
    const profile = scanProject(root);
    expect(profile.languages).toContain("python");
    expect(profile.frameworks).toContain("fastapi");
    expect(profile.testRunners).toContain("pytest");
  });

  it("detects monorepo markers", () => {
    const root = tempProject("mono");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root", private: true }));
    const profile = scanProject(root);
    expect(profile.monorepo).toBe(true);
    expect(profile.packageManagers).toContain("pnpm");
  });

  it("handles malformed package.json without throwing", () => {
    const root = tempProject("bad-pkg");
    writeFileSync(join(root, "package.json"), "{not-json");
    const profile = scanProject(root);
    expect(profile.metadata.packageJsonParseError).toBe("true");
  });

  it("excludes node_modules from deep reads", () => {
    const root = tempProject("exclude");
    mkdirSync(join(root, "node_modules", "left-pad"), { recursive: true });
    writeFileSync(join(root, "node_modules", "left-pad", "package.json"), '{"name":"left-pad"}');
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "app" }));
    const profile = scanProject(root);
    expect(profile.languages).toContain("javascript");
  });
});
