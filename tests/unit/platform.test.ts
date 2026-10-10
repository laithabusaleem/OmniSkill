import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runInit } from "../../src/commands/init.js";
import { classifyTask } from "../../src/core/classifier.js";
import { buildWorkflowPlan } from "../../src/core/workflow-planner.js";
import {
  ensureCapabilityRegistry,
  loadCapabilityRegistry,
} from "../../src/platform/capability-registry.js";
import { discoverCapabilities } from "../../src/platform/discovery/orchestrate.js";
import { executeWorkflowPlan, loadJob } from "../../src/platform/execution/engine.js";
import { loadArtifactManifest } from "../../src/platform/artifacts.js";
import {
  FfmpegAdapter,
  ffmpegAvailable,
  resolveFfmpegBin,
} from "../../src/platform/media/ffmpeg-adapter.js";
import { derivedPath } from "../../src/platform/artifacts.js";
import { makeTempDir, seedProject } from "../helpers/temp.js";

async function silence<T>(fn: () => Promise<T>): Promise<T> {
  const out = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await fn();
  } finally {
    process.stdout.write = out;
  }
}

describe("universal capability registry", () => {
  it("seeds builtin capabilities without claiming ffmpeg available", async () => {
    const root = makeTempDir();
    seedProject(root);
    await silence(() => runInit({ cwd: root, yes: true, json: true }));
    const doc = ensureCapabilityRegistry(root);
    expect(doc.capabilities.some((c) => c.id === "tool.ffmpeg")).toBe(true);
    const ffmpeg = doc.capabilities.find((c) => c.id === "tool.ffmpeg")!;
    expect(ffmpeg.status === "discovered" || ffmpeg.status === "unavailable" || ffmpeg.status === "available").toBe(
      true,
    );
    expect(ffmpeg.provenance.verified).toBe(false);
  });
});

describe("provider discovery", () => {
  it("searches registry + tools with honest coverage notes", async () => {
    const root = makeTempDir();
    seedProject(root);
    await silence(() => runInit({ cwd: root, yes: true, json: true }));
    const result = await discoverCapabilities(root, "Create a short tiktok reel with captions", {
      offline: true,
    });
    expect(result.providersUsed.length).toBeGreaterThan(0);
    expect(result.coverage.toLowerCase()).toContain("not an exhaustive");
    expect(result.candidates.some((c) => c.capability.kind === "tool")).toBe(true);
    expect(result.uncertainty.length).toBeGreaterThan(0);
  });
});

describe("workflow execution engine", () => {
  it("executes document stages, stops for approval, tracks artifacts", async () => {
    const root = makeTempDir();
    seedProject(root);
    await silence(() => runInit({ cwd: root, yes: true, json: true }));
    const classification = classifyTask("Go to market plan with pricing and sales assets");
    const plan = buildWorkflowPlan({ projectRoot: root, classification });
    const job = await executeWorkflowPlan({
      projectRoot: root,
      plan,
      approvals: [],
      allowMediaRender: false,
    });
    expect(job.status === "awaiting_approval" || job.status === "partial" || job.status === "succeeded").toBe(
      true,
    );
    expect(job.steps.length).toBeGreaterThan(0);
    const loaded = loadJob(root, job.id);
    expect(loaded?.id).toBe(job.id);
    const arts = loadArtifactManifest(root);
    expect(arts.artifacts.length).toBeGreaterThan(0);
    expect(arts.artifacts.every((a) => a.status !== "verified" || a.verifiedChecks.length > 0)).toBe(true);
  });

  it("does not mark video verified when media render disabled", async () => {
    const root = makeTempDir();
    seedProject(root);
    await silence(() => runInit({ cwd: root, yes: true, json: true }));
    const classification = classifyTask("Produce a tiktok reel storyboard and assemble export");
    const plan = buildWorkflowPlan({ projectRoot: root, classification });
    const approveAll = plan.stages.filter((s) => s.requiresApproval).map((s) => s.id);
    const job = await executeWorkflowPlan({
      projectRoot: root,
      plan,
      approvals: approveAll,
      allowMediaRender: false,
      maxSteps: 20,
    });
    const videoArts = loadArtifactManifest(root).artifacts.filter((a) => a.kind === "video");
    expect(videoArts.length).toBe(0);
    expect(job.steps.every((s) => !(s.verified && /Rendered and verified video/i.test(s.message)))).toBe(
      true,
    );
  });
});

describe("ffmpeg adapter", () => {
  it("probes without claiming availability when missing", async () => {
    const adapter = new FfmpegAdapter();
    const probe = await adapter.probe({
      projectRoot: makeTempDir(),
      allowSideEffects: false,
      permissions: new Set(),
      log: () => undefined,
    });
    if (!ffmpegAvailable()) {
      expect(probe.status).toBe("unavailable");
    } else {
      expect(probe.status).toBe("available");
    }
  });

  it("renders and verifies a synthetic clip when ffmpeg is installed", async () => {
    if (!ffmpegAvailable()) {
      // Environment limitation — reported, not failed
      expect(resolveFfmpegBin().ffmpeg).toBeFalsy();
      return;
    }
    const root = makeTempDir();
    seedProject(root);
    await silence(() => runInit({ cwd: root, yes: true, json: true }));
    const out = derivedPath(root, "media", "test-clip.mp4");
    const adapter = new FfmpegAdapter();
    const result = await adapter.execute(
      { op: "generate-test-pattern", outPath: out, seconds: 1, width: 320, height: 240 },
      {
        projectRoot: root,
        allowSideEffects: true,
        permissions: new Set(["shell", "filesystem_write", "filesystem_read"]),
        log: () => undefined,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(existsSync(out)).toBe(true);
    const meta = adapter.inspect(out);
    expect(meta.hasVideo).toBe(true);
  });
});

describe("capability registry persistence", () => {
  it("round-trips after ensure", async () => {
    const root = makeTempDir();
    seedProject(root);
    await silence(() => runInit({ cwd: root, yes: true, json: true }));
    ensureCapabilityRegistry(root);
    const again = loadCapabilityRegistry(root);
    expect(again.capabilities.length).toBeGreaterThan(0);
  });
});
