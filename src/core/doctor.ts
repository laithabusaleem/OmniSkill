import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DoctorCheck } from "../types/index.js";
import { BEGIN_MARKER, END_MARKER, validateMarkers } from "./installer.js";
import { loadConfig, paths } from "./config.js";
import { loadProfile } from "./scanner.js";
import { loadRegistry } from "./registry.js";
import { skillCachePath } from "./cache.js";

export interface DoctorOptions {
  online?: boolean;
  fetchImpl?: typeof fetch;
}

export async function runDoctor(projectRoot: string, options: DoctorOptions = {}): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  const major = Number(process.versions.node.split(".")[0]);
  checks.push(
    major >= 20
      ? {
          id: "node-version",
          status: "PASS",
          message: `Node.js ${process.versions.node} is supported.`,
          remediation: "None.",
        }
      : {
          id: "node-version",
          status: "FAIL",
          message: `Node.js ${process.versions.node} is below required >=20.`,
          remediation: "Upgrade Node.js to version 20 or newer.",
        },
  );

  const p = paths(projectRoot);
  if (!existsSync(p.root)) {
    checks.push({
      id: "omni-dir",
      status: "FAIL",
      message: ".omni directory missing.",
      remediation: "Run `omniskill init`.",
    });
    return checks;
  }

  try {
    accessSync(p.root, constants.W_OK);
    checks.push({
      id: "writable",
      status: "PASS",
      message: ".omni is writable.",
      remediation: "None.",
    });
  } catch {
    checks.push({
      id: "writable",
      status: "FAIL",
      message: ".omni is not writable.",
      remediation: "Fix directory permissions for the project .omni folder.",
    });
  }

  try {
    loadConfig(projectRoot);
    checks.push({ id: "config", status: "PASS", message: "Config valid.", remediation: "None." });
  } catch (err) {
    checks.push({
      id: "config",
      status: "FAIL",
      message: err instanceof Error ? err.message : String(err),
      remediation: "Fix or delete .omni/config.json.",
    });
  }

  try {
    const registry = loadRegistry(projectRoot);
    checks.push({
      id: "registry",
      status: "PASS",
      message: `Registry valid (${registry.skills.length} skills, ${registry.sources.length} sources).`,
      remediation: "None.",
    });

    let missingCache = 0;
    for (const skill of registry.skills) {
      if (skill.cacheStatus === "cached" && !existsSync(skillCachePath(projectRoot, skill.id))) {
        missingCache += 1;
      }
    }
    checks.push(
      missingCache === 0
        ? {
            id: "cache-consistency",
            status: "PASS",
            message: "Cached skill files match registry cacheStatus.",
            remediation: "None.",
          }
        : {
            id: "cache-consistency",
            status: "WARN",
            message: `${missingCache} skill(s) marked cached but missing on disk.`,
            remediation: "Run `omniskill sync`.",
          },
    );
  } catch (err) {
    checks.push({
      id: "registry",
      status: "FAIL",
      message: err instanceof Error ? err.message : String(err),
      remediation: "Restore registry from backup or re-init only if no user data would be lost.",
    });
  }

  const profile = loadProfile(projectRoot);
  checks.push(
    profile
      ? {
          id: "profile",
          status: "PASS",
          message: `Profile present (scanned ${profile.scannedAt}).`,
          remediation: "None.",
        }
      : {
          id: "profile",
          status: "WARN",
          message: "Profile missing.",
          remediation: "Run `omniskill scan`.",
        },
  );

  for (const rel of ["CLAUDE.md", join(".cursor", "rules", "omniskill.mdc")]) {
    const file = join(projectRoot, rel);
    if (!existsSync(file)) continue;
    try {
      const content = readFileSync(file, "utf8");
      if (content.includes(BEGIN_MARKER) || content.includes(END_MARKER)) {
        validateMarkers(content);
        checks.push({
          id: `markers:${rel}`,
          status: "PASS",
          message: `Markers OK in ${rel}.`,
          remediation: "None.",
        });
      }
    } catch (err) {
      checks.push({
        id: `markers:${rel}`,
        status: "FAIL",
        message: err instanceof Error ? err.message : String(err),
        remediation: "Repair OmniSkill markers manually; restore from .omni/backups if needed.",
      });
    }
  }

  const cursorRule = join(projectRoot, ".cursor", "rules", "omniskill.mdc");
  if (existsSync(cursorRule)) {
    try {
      const { assertCursorRuleFormat } = await import("./agent-adapters.js");
      assertCursorRuleFormat(readFileSync(cursorRule, "utf8"));
      checks.push({
        id: "cursor-rule-format",
        status: "PASS",
        message: "Cursor omniskill.mdc starts with valid YAML frontmatter.",
        remediation: "None.",
      });
    } catch (err) {
      checks.push({
        id: "cursor-rule-format",
        status: "FAIL",
        message: err instanceof Error ? err.message : String(err),
        remediation: "Re-run `omniskill init --agent cursor --yes` to regenerate the rule file.",
      });
    }
  }

  checks.push({
    id: "agent-integration",
    status: "PASS",
    message:
      "Adapters: claude-code (CLAUDE.md markers), cursor (.mdc frontmatter), portable (Markdown export). Bundles are not auto-loaded by agents.",
    remediation: "Use `omniskill init --yes` and `omniskill export`; attach bundles manually when needed.",
  });

  if (options.online) {
    try {
      const registry = loadRegistry(projectRoot);
      const source = registry.sources[0];
      if (!source) {
        checks.push({
          id: "online-source",
          status: "WARN",
          message: "No sources to probe online.",
          remediation: "Add a source with `omniskill add`.",
        });
      } else {
        const fetchImpl = options.fetchImpl ?? globalThis.fetch;
        const res = await fetchImpl(`https://api.github.com/repos/${source.owner}/${source.repo}`, {
          headers: { "User-Agent": "omniskill-cli", Accept: "application/vnd.github+json" },
        });
        checks.push(
          res.ok
            ? {
                id: "online-source",
                status: "PASS",
                message: `Online check OK for ${source.owner}/${source.repo}.`,
                remediation: "None.",
              }
            : {
                id: "online-source",
                status: "WARN",
                message: `Online check HTTP ${res.status} for ${source.owner}/${source.repo}.`,
                remediation: "Verify network, rate limits, or GITHUB_TOKEN.",
              },
        );
      }
    } catch (err) {
      checks.push({
        id: "online-source",
        status: "WARN",
        message: `Online check skipped/failed: ${err instanceof Error ? err.message : String(err)}`,
        remediation: "Offline mode is supported; online failures are warnings only.",
      });
    }
  } else {
    checks.push({
      id: "online-source",
      status: "PASS",
      message: "Online source checks not requested (offline doctor).",
      remediation: "Pass --online to probe GitHub accessibility.",
    });
  }

  return checks;
}
