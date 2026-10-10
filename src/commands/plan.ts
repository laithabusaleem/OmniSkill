import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classificationPreferDomains, classifyTask } from "../core/classifier.js";
import { loadConfig, paths, requireOmniInitialized } from "../core/config.js";
import { printJson, printLines, summarizeTask } from "../core/io.js";
import { appendLog } from "../core/logger.js";
import { matchSkills } from "../core/matcher.js";
import { loadRegistry } from "../core/registry.js";
import { loadProfile } from "../core/scanner.js";
import { selectContextForDomains, loadProjectContext } from "../core/project-context.js";
import { buildWorkflowPlan, workflowPlanToMarkdown } from "../core/workflow-planner.js";

export async function runPlan(options: {
  cwd: string;
  task: string;
  format?: "markdown" | "json";
  json?: boolean;
  write?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const config = loadConfig(options.cwd);
  const registry = loadRegistry(options.cwd);
  const profile = loadProfile(options.cwd);
  const classification = classifyTask(options.task, profile);
  const match = matchSkills(options.task, profile, registry, config, {
    preferences: config.orchestration.autoClassifyOnMatch
      ? { preferDomains: classificationPreferDomains(classification) }
      : undefined,
  });

  const plan = buildWorkflowPlan({
    projectRoot: options.cwd,
    classification,
    match,
  });

  const ctx = loadProjectContext(options.cwd);
  const contextEntries = selectContextForDomains(ctx, [
    classification.primaryDomain,
    ...classification.secondaryDomains,
  ]);

  appendLog(options.cwd, {
    timestamp: new Date().toISOString(),
    type: "plan",
    taskSummary: summarizeTask(options.task, config.privacy.logRawTask),
    selectedSkills: plan.selectedSkillIds,
    outcome: "unverified",
    meta: { templateId: plan.templateId, stages: plan.stages.length },
  });

  const format = options.json ? "json" : options.format ?? "markdown";
  const md = workflowPlanToMarkdown(plan);
  let outPath: string | undefined;

  if (options.write !== false) {
    const dir = paths(options.cwd).plans;
    mkdirSync(dir, { recursive: true });
    const slug =
      options.task
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "plan";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "json") {
      outPath = join(dir, `${stamp}-${slug}.json`);
      writeFileSync(outPath, `${JSON.stringify({ plan, contextEntries }, null, 2)}\n`, "utf8");
    } else {
      outPath = join(dir, `${stamp}-${slug}.md`);
      const ctxBlock =
        contextEntries.length === 0
          ? ""
          : `\n## Project context (selected)\n\n${contextEntries
              .map((e) => `- **${e.key}** (${e.kind}): ${e.value.slice(0, 200)}`)
              .join("\n")}\n`;
      writeFileSync(outPath, `${md}${ctxBlock}`, "utf8");
    }
  }

  if (options.json || format === "json") {
    printJson({ plan, contextEntries, path: outPath });
    return 0;
  }

  printLines([
    ...md.split("\n").slice(0, 40),
    md.split("\n").length > 40 ? "…" : "",
    outPath ? `Wrote: ${outPath}` : "Not written (--no-write).",
    "",
    "Unavailable capabilities are listed honestly — skills cannot replace missing tools.",
  ].filter(Boolean));
  return 0;
}
