import { loadConfig, requireOmniInitialized } from "../core/config.js";
import { printJson, printLines } from "../core/io.js";
import { appendLog } from "../core/logger.js";
import { loadRegistry, saveRegistry } from "../core/registry.js";
import type { TrustStatus } from "../types/index.js";

export async function runApprove(options: {
  cwd: string;
  skillId: string;
  reject?: boolean;
  quarantine?: boolean;
  json?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const registry = loadRegistry(options.cwd);
  const skill = registry.skills.find((s) => s.id === options.skillId);
  if (!skill) {
    printLines([`Unknown skill id: ${options.skillId}`]);
    return 1;
  }

  let trust: TrustStatus = "reviewed";
  if (options.reject) trust = "blocked";
  else if (options.quarantine) trust = "quarantined";

  skill.trustStatus = trust;
  if (trust === "blocked") skill.disabled = true;
  if (trust === "reviewed") skill.disabled = false;

  saveRegistry(options.cwd, registry);
  const config = loadConfig(options.cwd);
  appendLog(options.cwd, {
    timestamp: new Date().toISOString(),
    type: "approve",
    selectedSkills: [skill.id],
    outcome: trust === "blocked" ? "blocked" : "verified",
    meta: { trust, agent: config.agent },
  });

  const payload = { ok: true, skillId: skill.id, trustStatus: trust };
  if (options.json) printJson(payload);
  else printLines([`Skill ${skill.id} → trustStatus=${trust}`, "Risky skills stay out of auto-select when quarantined/blocked."]);
  return 0;
}
