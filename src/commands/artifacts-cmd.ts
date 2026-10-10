import { requireOmniInitialized } from "../core/config.js";
import { printJson, printLines } from "../core/io.js";
import { ensureArtifactDirs, loadArtifactManifest } from "../platform/artifacts.js";

export async function runArtifacts(options: { cwd: string; json?: boolean }): Promise<number> {
  requireOmniInitialized(options.cwd);
  ensureArtifactDirs(options.cwd);
  const man = loadArtifactManifest(options.cwd);
  if (options.json) {
    printJson(man);
    return 0;
  }
  printLines([
    `Artifacts: ${man.artifacts.length} (updated ${man.updatedAt})`,
    "",
    ...man.artifacts.map(
      (a) => `- [${a.status}] ${a.kind} ${a.name} → ${a.path} checks=${a.verifiedChecks.join(",") || "none"}`,
    ),
    man.artifacts.length === 0 ? "(none yet — run `omniskill run \"...\"`)" : "",
  ].filter(Boolean));
  return 0;
}
