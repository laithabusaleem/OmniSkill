import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanProject } from "../../src/core/scanner.js";
import { makeTempDir, seedProject } from "../helpers/temp.js";

describe("scanner edge cases", () => {
  it("handles mixed-language repository", () => {
    const root = makeTempDir();
    seedProject(root, {
      packageJson: {
        name: "mixed",
        dependencies: { express: "4.0.0" },
        devDependencies: { typescript: "5.0.0", jest: "29.0.0" },
      },
      files: {
        "tsconfig.json": "{}",
        "go.mod": "module example.com/app\n",
        "Cargo.toml": '[package]\nname = "app"\nversion = "0.1.0"\n',
        "requirements.txt": "django\n",
        "manage.py": "print('django')\n",
        "Dockerfile": "FROM node:20\n",
        "vercel.json": "{}\n",
        ".gitlab-ci.yml": "stages: [test]\n",
      },
    });
    const profile = scanProject(root);
    expect(profile.languages).toEqual(expect.arrayContaining(["typescript", "go", "rust", "python"]));
    expect(profile.frameworks).toEqual(expect.arrayContaining(["express", "django"]));
    expect(profile.testRunners).toContain("jest");
    expect(profile.deployment).toEqual(expect.arrayContaining(["docker", "vercel"]));
    expect(profile.ci).toContain("gitlab-ci");
  });

  it("caps large directory trees without throwing", () => {
    const root = makeTempDir();
    seedProject(root, { packageJson: { name: "large" } });
    for (let i = 0; i < 450; i += 1) {
      writeFileSync(join(root, `f${i}.txt`), "x");
    }
    const profile = scanProject(root);
    expect(Number(profile.metadata.fileSampleCount)).toBeLessThanOrEqual(400);
  });

  it("excludes dependency and VCS directories from influence", () => {
    const root = makeTempDir();
    seedProject(root, {
      packageJson: { name: "app" },
      files: {
        "node_modules/react/package.json": JSON.stringify({ name: "react", version: "99.0.0" }),
        ".git/config": "[core]\n",
        "dist/index.js": "console.log(1)\n",
      },
    });
    const profile = scanProject(root);
    expect(profile.frameworks).not.toContain("react");
  });

  it("tolerates unreadable directories", () => {
    const root = makeTempDir();
    seedProject(root, { packageJson: { name: "perm" } });
    const locked = join(root, "locked-dir");
    mkdirSync(locked);
    writeFileSync(join(locked, "secret.txt"), "nope");
    if (process.platform !== "win32") {
      chmodSync(locked, 0);
    }
    expect(() => scanProject(root)).not.toThrow();
    if (process.platform !== "win32") {
      chmodSync(locked, 0o755);
    }
  });

  it("handles symlinks when the platform permits", () => {
    const root = makeTempDir();
    seedProject(root, { packageJson: { name: "linky" } });
    const target = join(root, "real-file.txt");
    writeFileSync(target, "hello");
    try {
      symlinkSync(target, join(root, "link.txt"));
    } catch {
      // Windows often requires elevation; skip assertion
      return;
    }
    expect(() => scanProject(root)).not.toThrow();
  });

  it("detects nestjs and playwright tooling", () => {
    const root = makeTempDir();
    seedProject(root, {
      packageJson: {
        name: "nest",
        dependencies: { "@nestjs/core": "10.0.0" },
        devDependencies: { "@playwright/test": "1.40.0", cypress: "13.0.0" },
      },
    });
    const profile = scanProject(root);
    expect(profile.frameworks).toContain("nestjs");
    expect(profile.testRunners).toEqual(expect.arrayContaining(["playwright", "cypress"]));
  });
});
