import type { DiscoveryProvider, AdapterContext } from "../adapters/contracts.js";
import type { DiscoveryCandidate, DiscoveryQuery } from "../types.js";
import { ffmpegAvailable, resolveFfmpegBin } from "../media/ffmpeg-adapter.js";

export class LocalToolsDiscoveryProvider implements DiscoveryProvider {
  id = "discovery.local-tools";
  name = "Local executables";

  async discover(query: DiscoveryQuery, ctx: AdapterContext): Promise<DiscoveryCandidate[]> {
    const wantsMedia = /video|reel|ffmpeg|render|audio|subtitle|mp4|edit/i.test(query.task);
    const bins = resolveFfmpegBin();
    const available = ffmpegAvailable();
    ctx.log(`local-tools: ffmpeg=${bins.ffmpeg ?? "missing"}`);
    const candidates: DiscoveryCandidate[] = [
      {
        capability: {
          id: "tool.ffmpeg",
          kind: "tool",
          name: "FFmpeg",
          description: "Local media processing engine",
          status: available ? "available" : "unavailable",
          io: { inputs: ["media"], outputs: ["media"] },
          dependencies: [],
          permissions: ["shell", "filesystem_read", "filesystem_write"],
          provenance: {
            source: "host-path",
            verified: available,
            notes: available ? `Resolved ${bins.ffmpeg}` : "Not on PATH",
          },
          executionMethod: "adapter",
          adapterId: "media.ffmpeg",
          verification: "ffprobe after render",
          tags: ["media", "video", "audio"],
          meta: {},
        },
        score: wantsMedia ? (available ? 40 : 5) : available ? 8 : 0,
        decision: wantsMedia ? (available ? "select" : "review") : available ? "review" : "reject",
        reasons: [
          wantsMedia ? "Task appears media-related" : "General tool inventory",
          available ? "ffmpeg binary resolved" : "ffmpeg missing — plan-only media path",
        ],
        warnings: available ? [] : ["Cannot claim video render without ffmpeg"],
        coverageNote: "PATH / OMNISKILL_FFMPEG only — not a full OS application scan",
      },
    ];
    return candidates;
  }
}
