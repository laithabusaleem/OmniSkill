import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { paths, ensureOmniDirs } from "../../core/config.js";
import type { WorkflowPlan, WorkflowStage } from "../../types/index.js";
import { registerArtifact, derivedPath } from "../artifacts.js";
import { FfmpegAdapter, ffmpegAvailable } from "../media/ffmpeg-adapter.js";
import type { ExecutionJob, ExecutionStepResult, JobStatus } from "../types.js";

const JOBS_DIR = "jobs";

function jobsRoot(projectRoot: string): string {
  return join(paths(projectRoot).root, JOBS_DIR);
}

export function jobPath(projectRoot: string, jobId: string): string {
  return join(jobsRoot(projectRoot), `${jobId}.json`);
}

export function saveJob(projectRoot: string, job: ExecutionJob): void {
  ensureOmniDirs(projectRoot);
  mkdirSync(jobsRoot(projectRoot), { recursive: true });
  writeFileSync(jobPath(projectRoot, job.id), `${JSON.stringify(job, null, 2)}\n`, "utf8");
}

export function loadJob(projectRoot: string, jobId: string): ExecutionJob | null {
  const file = jobPath(projectRoot, jobId);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as ExecutionJob;
}

function stageReady(stage: WorkflowStage, done: Set<string>): boolean {
  return stage.dependsOn.every((d) => done.has(d));
}

/**
 * Execute a workflow plan with checkpoints.
 * Distinguishes planning artifacts from verified media/code outputs.
 */
export async function executeWorkflowPlan(options: {
  projectRoot: string;
  plan: WorkflowPlan;
  /** Stage ids the user has approved. */
  approvals?: string[];
  /** When true, attempt media render if ffmpeg available. */
  allowMediaRender?: boolean;
  maxSteps?: number;
}): Promise<ExecutionJob> {
  const approvals = new Set(options.approvals ?? []);
  const job: ExecutionJob = {
    id: `job_${Date.now().toString(36)}`,
    task: options.plan.task,
    planTemplateId: options.plan.templateId,
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [],
    approvalsRequired: options.plan.stages.filter((s) => s.requiresApproval).map((s) => s.id),
    approvalsGranted: [...approvals],
    artifactIds: [],
    logs: [],
  };

  const done = new Set<string>();
  const failed = new Set<string>();
  let stepsRun = 0;
  const maxSteps = options.maxSteps ?? options.plan.stages.length;

  const pending = [...options.plan.stages];
  while (pending.length && stepsRun < maxSteps) {
    const idx = pending.findIndex((s) => stageReady(s, done) && !failed.has(s.id));
    if (idx < 0) break;
    const [stage] = pending.splice(idx, 1);
    if (!stage) break;

    if (stage.requiresApproval && !approvals.has(stage.id)) {
      const step: ExecutionStepResult = {
        stepId: stage.id,
        status: "awaiting_approval",
        message: stage.approvalReason ?? "User approval required",
        artifacts: [],
        verified: false,
      };
      job.steps.push(step);
      job.status = "awaiting_approval";
      job.logs.push(`Paused at ${stage.id}: approval required`);
      job.updatedAt = new Date().toISOString();
      saveJob(options.projectRoot, job);
      return job;
    }

    const startedAt = new Date().toISOString();
    const result = await runStage(options.projectRoot, options.plan, stage, {
      allowMediaRender: options.allowMediaRender ?? false,
      log: (m) => job.logs.push(m),
    });
    result.startedAt = startedAt;
    result.finishedAt = new Date().toISOString();
    job.steps.push(result);
    job.artifactIds.push(...result.artifacts);
    stepsRun += 1;

    if (result.status === "succeeded" || result.status === "partial") {
      done.add(stage.id);
    } else if (result.status === "failed") {
      failed.add(stage.id);
      job.status = "failed";
      job.updatedAt = new Date().toISOString();
      saveJob(options.projectRoot, job);
      return job;
    }
  }

  if (job.status === "running") {
    if (failed.size) job.status = "failed";
    else if (done.size < options.plan.stages.length) job.status = "partial";
    else job.status = "succeeded";
  }
  job.updatedAt = new Date().toISOString();
  saveJob(options.projectRoot, job);
  return job;
}

async function runStage(
  projectRoot: string,
  plan: WorkflowPlan,
  stage: WorkflowStage,
  opts: { allowMediaRender: boolean; log: (m: string) => void },
): Promise<ExecutionStepResult> {
  // Always write a stage note artifact (document) — not claimed as final media
  const notePath = derivedPath(projectRoot, "stages", `${stage.id}.md`);
  mkdirSync(dirname(notePath), { recursive: true });
  writeFileSync(
    notePath,
    `# Stage: ${stage.title}\n\n${stage.description}\n\nDeliverables:\n${stage.deliverables.map((d) => `- ${d}`).join("\n")}\n`,
    "utf8",
  );
  const noteId = `art_${stage.id}_note`;
  registerArtifact(projectRoot, {
    id: noteId,
    name: `${stage.id}-notes`,
    kind: "document",
    path: notePath,
    format: "markdown",
    status: "produced",
    producedBy: `stage:${stage.id}`,
    dependsOn: stage.dependsOn,
    provenance: "omniskill-execution-engine",
    verifiedChecks: ["file-exists"],
    createdAt: new Date().toISOString(),
  });

  // Media-capable stages
  const mediaStage = /assemble|render|footage|verify-av|export/i.test(stage.id + stage.title);
  if (mediaStage && opts.allowMediaRender) {
    if (!ffmpegAvailable()) {
      opts.log(`Stage ${stage.id}: ffmpeg unavailable — document artifact only`);
      return {
        stepId: stage.id,
        status: "partial",
        message: "Stage notes written; video render skipped (ffmpeg unavailable)",
        artifacts: [noteId],
        verified: false,
      };
    }
    const out = derivedPath(projectRoot, "media", `${plan.templateId}-${stage.id}.mp4`);
    const ffmpeg = new FfmpegAdapter();
    const exec = await ffmpeg.execute(
      { op: "assemble-short", outPath: out, seconds: 2, width: 720, height: 1280 },
      {
        projectRoot,
        allowSideEffects: true,
        permissions: new Set(["shell", "filesystem_write", "filesystem_read"]),
        log: opts.log,
      },
    );
    if (exec.ok && exec.verified && exec.artifacts?.[0]) {
      registerArtifact(projectRoot, {
        id: `art_${stage.id}_video`,
        name: `${stage.id}-render`,
        kind: "video",
        path: exec.artifacts[0],
        format: "mp4",
        status: "verified",
        producedBy: "media.ffmpeg",
        dependsOn: [`art_${stage.id}_note`],
        provenance: "ffmpeg-lavfi-synthetic",
        verifiedChecks: ["file-exists", "has-video-stream"],
        createdAt: new Date().toISOString(),
      });
      return {
        stepId: stage.id,
        status: "succeeded",
        message: exec.message,
        artifacts: [noteId, `art_${stage.id}_video`],
        verified: true,
      };
    }
    return {
      stepId: stage.id,
      status: "failed",
      message: exec.message,
      artifacts: [noteId],
      verified: false,
      error: exec.message,
    };
  }

  return {
    stepId: stage.id,
    status: "succeeded",
    message: `Stage artifact written (planning/document). Not a claim of external tool success.`,
    artifacts: [noteId],
    verified: true,
  };
}

export function formatJobReport(job: ExecutionJob): string {
  const lines = [
    `# Execution job ${job.id}`,
    "",
    `Task: ${job.task}`,
    `Template: ${job.planTemplateId}`,
    `Status: ${job.status}`,
    "",
    "## Steps",
    "",
  ];
  for (const s of job.steps) {
    lines.push(`- \`${s.stepId}\` → ${s.status} verified=${s.verified}`);
    lines.push(`  ${s.message}`);
  }
  lines.push("", "## Logs", "");
  for (const l of job.logs) lines.push(`- ${l}`);
  lines.push("");
  return lines.join("\n");
}

export type { JobStatus };
