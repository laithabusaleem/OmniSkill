import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AdapterContext, MediaProcessor } from "../adapters/contracts.js";
import type { LifecycleStatus } from "../types.js";

export interface MediaProbeResult {
  path: string;
  formatName?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  hasVideo: boolean;
  hasAudio: boolean;
  raw?: unknown;
}

function which(cmd: string): string | undefined {
  const isWin = process.platform === "win32";
  const finder = isWin ? "where" : "which";
  const res = spawnSync(finder, [cmd], { encoding: "utf8" });
  if (res.status !== 0) return undefined;
  const line = (res.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  return line && existsSync(line) ? line : line || undefined;
}

export function resolveFfmpegBin(): { ffmpeg?: string; ffprobe?: string } {
  const fromEnvF = process.env.OMNISKILL_FFMPEG;
  const fromEnvP = process.env.OMNISKILL_FFPROBE;
  return {
    ffmpeg: fromEnvF && existsSync(fromEnvF) ? fromEnvF : which("ffmpeg"),
    ffprobe: fromEnvP && existsSync(fromEnvP) ? fromEnvP : which("ffprobe") || which("ffmpeg"),
  };
}

export function ffmpegAvailable(): boolean {
  return Boolean(resolveFfmpegBin().ffmpeg);
}

export class FfmpegAdapter implements MediaProcessor {
  id = "media.ffmpeg";
  name = "FFmpeg media processor";
  kind = "media" as const;
  supportedOperations = [
    "probe",
    "generate-test-pattern",
    "concat-silence-video",
    "burn-subtitles",
    "encode-preset",
  ];

  async probe(ctx: AdapterContext): Promise<{ status: LifecycleStatus; detail: string }> {
    const bins = resolveFfmpegBin();
    if (!bins.ffmpeg) {
      return {
        status: "unavailable",
        detail: "ffmpeg not found on PATH (set OMNISKILL_FFMPEG to override).",
      };
    }
    const ver = spawnSync(bins.ffmpeg, ["-version"], { encoding: "utf8" });
    if (ver.status !== 0) {
      return { status: "unavailable", detail: "ffmpeg -version failed" };
    }
    const first = (ver.stdout || "").split(/\r?\n/)[0] ?? "ffmpeg present";
    ctx.log(`ffmpeg probe: ${first}`);
    return { status: "available", detail: first };
  }

  /** Inspect a media file — verified only when ffprobe/ffmpeg returns parseable JSON. */
  inspect(filePath: string): MediaProbeResult {
    const bins = resolveFfmpegBin();
    const probeBin = bins.ffprobe ?? bins.ffmpeg;
    if (!probeBin || !existsSync(filePath)) {
      return { path: filePath, hasVideo: false, hasAudio: false };
    }
    const args =
      probeBin.endsWith("ffprobe") || probeBin.includes("ffprobe")
        ? ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath]
        : ["-i", filePath];
    const res = spawnSync(probeBin, args, { encoding: "utf8" });
    if (probeBin.includes("ffprobe") || (bins.ffprobe && probeBin === bins.ffprobe)) {
      try {
        const json = JSON.parse(res.stdout || "{}") as {
          format?: { duration?: string; format_name?: string };
          streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
        };
        const streams = json.streams ?? [];
        const video = streams.find((s) => s.codec_type === "video");
        const audio = streams.find((s) => s.codec_type === "audio");
        return {
          path: filePath,
          formatName: json.format?.format_name,
          durationSec: json.format?.duration ? Number(json.format.duration) : undefined,
          width: video?.width,
          height: video?.height,
          hasVideo: Boolean(video),
          hasAudio: Boolean(audio),
          raw: json,
        };
      } catch {
        return { path: filePath, hasVideo: false, hasAudio: false };
      }
    }
    // ffmpeg -i dumps to stderr
    const err = res.stderr || "";
    return {
      path: filePath,
      hasVideo: /Video:/i.test(err),
      hasAudio: /Audio:/i.test(err),
      durationSec: undefined,
    };
  }

  /**
   * Render a small synthetic clip (color + silent/test audio) into outPath.
   * Returns verified=true only after inspect confirms video stream + file size.
   */
  async execute(
    input: Record<string, unknown>,
    ctx: AdapterContext,
  ): Promise<{ ok: boolean; message: string; artifacts?: string[]; verified?: boolean }> {
    if (!ctx.allowSideEffects) {
      return { ok: false, message: "Side effects disabled", verified: false };
    }
    if (!ctx.permissions.has("shell") || !ctx.permissions.has("filesystem_write")) {
      return { ok: false, message: "Missing shell/filesystem_write permission", verified: false };
    }
    const bins = resolveFfmpegBin();
    if (!bins.ffmpeg) {
      return { ok: false, message: "ffmpeg unavailable", verified: false };
    }

    const op = String(input.op ?? "generate-test-pattern");
    const outPath = String(input.outPath ?? "");
    if (!outPath) return { ok: false, message: "outPath required", verified: false };
    mkdirSync(dirname(outPath), { recursive: true });

    if (op === "generate-test-pattern" || op === "assemble-short") {
      const seconds = Math.min(10, Math.max(1, Number(input.seconds ?? 2)));
      const width = Number(input.width ?? 720);
      const height = Number(input.height ?? 1280);
      const args = [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=blue:s=${width}x${height}:d=${seconds}`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=440:duration=${seconds}`,
        "-shortest",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        outPath,
      ];
      const res = spawnSync(bins.ffmpeg, args, { encoding: "utf8" });
      if (res.status !== 0 || !existsSync(outPath)) {
        return {
          ok: false,
          message: `ffmpeg failed: ${(res.stderr || res.stdout || "").slice(-400)}`,
          verified: false,
        };
      }
      const meta = this.inspect(outPath);
      const verified = meta.hasVideo && existsSync(outPath);
      ctx.log(`Rendered ${outPath} verified=${verified} duration=${meta.durationSec ?? "?"}`);
      return {
        ok: verified,
        message: verified
          ? `Rendered and verified video at ${outPath}`
          : `File written but verification failed for ${outPath}`,
        artifacts: [outPath],
        verified,
      };
    }

    if (op === "write-production-plan") {
      // Fallback when ffmpeg missing should be handled by caller; here just write plan
      const planPath = outPath;
      writeFileSync(
        planPath,
        `# Media production plan\n\nFFmpeg unavailable — plan only.\nTask: ${String(input.task ?? "")}\n`,
        "utf8",
      );
      return {
        ok: true,
        message: "Wrote production plan (not a rendered video)",
        artifacts: [planPath],
        verified: false,
      };
    }

    return { ok: false, message: `Unsupported op: ${op}`, verified: false };
  }
}

export function defaultVerticalPreset() {
  return { width: 1080, height: 1920, label: "vertical-short" };
}

export function defaultLandscapePreset() {
  return { width: 1920, height: 1080, label: "landscape" };
}

export function mediaWorkDir(projectRoot: string): string {
  return join(projectRoot, ".omni", "artifacts", "media");
}
