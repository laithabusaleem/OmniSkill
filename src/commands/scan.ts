import { requireOmniInitialized } from "../core/config.js";
import { printJson, printLines } from "../core/io.js";
import { scanProject, writeProfile } from "../core/scanner.js";
import { paths } from "../core/config.js";

export async function runScan(options: { cwd: string; json?: boolean }): Promise<number> {
  requireOmniInitialized(options.cwd);
  const profile = scanProject(options.cwd);
  writeProfile(options.cwd, profile);
  if (options.json) {
    printJson(profile);
  } else {
    printLines([
      `Scanned project → ${paths(options.cwd).profile}`,
      `Languages: ${profile.languages.join(", ") || "none"}`,
      `Frameworks: ${profile.frameworks.join(", ") || "none"}`,
      `Tests: ${profile.testRunners.join(", ") || "none"}`,
      `CI: ${profile.ci.join(", ") || "none"}`,
      `Monorepo: ${profile.monorepo}`,
    ]);
  }
  return 0;
}
