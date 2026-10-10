import { detectCapabilities, formatCapabilitiesReport } from "../core/capabilities.js";
import { requireOmniInitialized } from "../core/config.js";
import { printJson, printLines } from "../core/io.js";

export async function runCapabilities(options: { cwd: string; json?: boolean }): Promise<number> {
  requireOmniInitialized(options.cwd);
  const caps = detectCapabilities(options.cwd);
  if (options.json) {
    printJson({ capabilities: caps });
    return 0;
  }
  printLines([
    "Environment capabilities (heuristic status — not a guarantee of tool success):",
    "",
    ...formatCapabilitiesReport(caps),
    "",
    "Skills guide agents; they do not create missing tools.",
  ]);
  return 0;
}
