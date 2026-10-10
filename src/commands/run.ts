import { classificationPreferDomains, classifyTask } from "../core/classifier.js";
import { loadConfig, requireOmniInitialized } from "../core/config.js";
import { printJson, printLines, summarizeTask } from "../core/io.js";
import { appendLog } from "../core/logger.js";
import { matchSkills } from "../core/matcher.js";
import { loadRegistry } from "../core/registry.js";
import { loadProfile } from "../core/scanner.js";
import { buildWorkflowPlan } from "../core/workflow-planner.js";
import { executeWorkflowPlan, formatJobReport, loadJob } from "../platform/execution/engine.js";
import { ffmpegAvailable } from "../platform/media/ffmpeg-adapter.js";

export async function runRun(options: {
  cwd: string;
  task: string;
  approve?: string;
  media?: boolean;
  jobId?: string;
  json?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);
  const config = loadConfig(options.cwd);

  if (options.jobId) {
    const job = loadJob(options.cwd, options.jobId);
    if (!job) {
      printLines([`Unknown job: ${options.jobId}`]);
      return 1;
    }
    if (options.json) printJson(job);
    else printLines([formatJobReport(job)]);
    return job.status === "failed" ? 1 : 0;
  }

  const profile = loadProfile(options.cwd);
  const registry = loadRegistry(options.cwd);
  const classification = classifyTask(options.task, profile);
  const match = matchSkills(options.task, profile, registry, config, {
    preferences: { preferDomains: classificationPreferDomains(classification) },
  });
  const plan = buildWorkflowPlan({ projectRoot: options.cwd, classification, match });

  const approvals = (options.approve ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowMedia = Boolean(options.media);
  if (allowMedia && !ffmpegAvailable()) {
    printLines([
      "Warning: --media requested but ffmpeg is not available. Stages will not claim a rendered video.",
    ]);
  }

  const job = await executeWorkflowPlan({
    projectRoot: options.cwd,
    plan,
    approvals,
    allowMediaRender: allowMedia && ffmpegAvailable(),
  });

  appendLog(options.cwd, {
    timestamp: new Date().toISOString(),
    type: "run",
    taskSummary: summarizeTask(options.task, config.privacy.logRawTask),
    outcome:
      job.status === "succeeded" ? "verified" : job.status === "failed" ? "failed" : "attempted",
    meta: { jobId: job.id, status: job.status, template: plan.templateId },
  });

  if (options.json) {
    printJson({ job, planSummary: { templateId: plan.templateId, stages: plan.stages.length } });
    return job.status === "failed" ? 1 : 0;
  }

  printLines([
    formatJobReport(job).trimEnd(),
    "",
    `Job file: .omni/jobs/${job.id}.json`,
    job.status === "awaiting_approval"
      ? `Re-run with --approve ${job.steps.find((s) => s.status === "awaiting_approval")?.stepId}`
      : "",
    "A successful document stage is not a successful video render.",
  ].filter(Boolean));
  return job.status === "failed" ? 1 : 0;
}
