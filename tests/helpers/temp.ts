import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

export function makeTempDir(prefix = "omniskill-qa2-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeJson(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function seedProject(
  root: string,
  opts: {
    packageJson?: Record<string, unknown> | string | null;
    files?: Record<string, string>;
  } = {},
): string {
  mkdirSync(root, { recursive: true });
  if (opts.packageJson !== null) {
    let content: string;
    if (opts.packageJson === undefined) {
      content = `${JSON.stringify({ name: "fixture", private: true }, null, 2)}\n`;
    } else if (typeof opts.packageJson === "string") {
      content = opts.packageJson.endsWith("\n") ? opts.packageJson : `${opts.packageJson}\n`;
    } else {
      content = `${JSON.stringify(opts.packageJson, null, 2)}\n`;
    }
    writeFileSync(join(root, "package.json"), content, "utf8");
  }
  for (const [rel, content] of Object.entries(opts.files ?? {})) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

export function cleanupTemp(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}
