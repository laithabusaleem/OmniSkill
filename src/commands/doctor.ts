import { requireOmniInitialized } from "../core/config.js";
import { runDoctor } from "../core/doctor.js";
import { printJson, printLines } from "../core/io.js";

export async function runDoctorCommand(options: {
  cwd: string;
  online?: boolean;
  json?: boolean;
}): Promise<number> {
  // doctor should work even before init for node check, but prefer initialized
  try {
    requireOmniInitialized(options.cwd);
  } catch {
    // still run partial checks
  }

  const checks = await runDoctor(options.cwd, { online: options.online });
  const failed = checks.filter((c) => c.status === "FAIL").length;
  const warned = checks.filter((c) => c.status === "WARN").length;

  if (options.json) {
    printJson({ checks, failed, warned });
  } else {
    printLines([
      ...checks.map((c) => `[${c.status}] ${c.id}: ${c.message} → ${c.remediation}`),
      "",
      `Summary: ${checks.length} checks, ${failed} FAIL, ${warned} WARN`,
    ]);
  }
  return failed > 0 ? 1 : 0;
}
