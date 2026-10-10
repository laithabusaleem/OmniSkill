import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CapabilityDescriptor, CapabilityStatus } from "../types/index.js";

function statusFromEnv(flag: string | undefined, whenSet: CapabilityStatus, whenUnset: CapabilityStatus): CapabilityStatus {
  if (flag === undefined || flag === "") return whenUnset;
  if (flag === "0" || flag.toLowerCase() === "false") return whenUnset;
  return whenSet;
}

/**
 * Describe what this OmniSkill process / host environment can actually do.
 * Heuristics only — never claim a tool succeeded unless it was used successfully.
 */
export function detectCapabilities(projectRoot: string): CapabilityDescriptor[] {
  const hasGitHubToken = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.length > 0);
  const networkDisabled = process.env.OMNISKILL_OFFLINE === "1" || process.env.OMNISKILL_OFFLINE === "true";

  const caps: CapabilityDescriptor[] = [
    {
      id: "local_files",
      name: "Local file reading and writing",
      status: "available",
      detail: `Project root accessible at ${projectRoot}`,
    },
    {
      id: "code_execution",
      name: "Code execution",
      status: "unavailable",
      detail: "OmniSkill does not execute project or skill scripts. The host agent may run commands separately.",
    },
    {
      id: "web_research",
      name: "Web research",
      status: networkDisabled
        ? "unavailable"
        : hasGitHubToken
          ? "requires_authorization"
          : "requires_configuration",
      detail: networkDisabled
        ? "OMNISKILL_OFFLINE is set."
        : "OmniSkill can fetch GitHub skill metadata with network access; general web browsing is not built in. Host agent tools may differ.",
    },
    {
      id: "github_skills",
      name: "GitHub skill discovery",
      status: networkDisabled ? "unavailable" : hasGitHubToken ? "available" : "requires_configuration",
      detail: networkDisabled
        ? "Offline mode."
        : hasGitHubToken
          ? "GITHUB_TOKEN present for higher rate limits."
          : "Public GitHub API may work unauthenticated with strict rate limits; set GITHUB_TOKEN for reliability.",
    },
    {
      id: "image_generation",
      name: "Image generation",
      status: statusFromEnv(process.env.OMNISKILL_IMAGE_TOOL, "requires_authorization", "unavailable"),
      detail: "Not provided by OmniSkill. Set OMNISKILL_IMAGE_TOOL only if a host tool is configured; still requires user authorization before spendy calls.",
    },
    {
      id: "audio",
      name: "Audio generation or transcription",
      status: statusFromEnv(process.env.OMNISKILL_AUDIO_TOOL, "requires_authorization", "unavailable"),
      detail: "Not provided by OmniSkill core.",
    },
    {
      id: "video",
      name: "Video generation or editing",
      status: statusFromEnv(process.env.OMNISKILL_VIDEO_TOOL, "requires_authorization", "unavailable"),
      detail: "OmniSkill can plan storyboards/scripts; it cannot claim to render or export video unless a configured tool actually succeeds.",
    },
    {
      id: "document_export",
      name: "Document and presentation export",
      status: "available",
      detail: "Markdown/JSON plans and bundles under .omni/. Binary pptx/pdf export is not built into OmniSkill.",
    },
    {
      id: "publishing",
      name: "Publishing or external integrations",
      status: "requires_authorization",
      detail: "Never auto-publish. Any external post requires explicit user approval.",
    },
  ];

  // Soft signal: presence of common media folders does not enable video capability
  if (existsSync(join(projectRoot, "assets")) || existsSync(join(projectRoot, "media"))) {
    const video = caps.find((c) => c.id === "video");
    if (video && video.status === "unavailable") {
      video.detail += " Local media folders detected — still no renderer in OmniSkill.";
    }
  }

  return caps;
}

export function capabilityMap(projectRoot: string): Map<string, CapabilityDescriptor> {
  return new Map(detectCapabilities(projectRoot).map((c) => [c.id, c]));
}

export function missingCapabilities(
  projectRoot: string,
  required: string[],
): CapabilityDescriptor[] {
  const map = capabilityMap(projectRoot);
  const missing: CapabilityDescriptor[] = [];
  for (const id of required) {
    const cap = map.get(id);
    if (!cap) {
      missing.push({
        id,
        name: id,
        status: "unavailable",
        detail: "Unknown capability id.",
      });
      continue;
    }
    if (cap.status !== "available") missing.push(cap);
  }
  return missing;
}

export function formatCapabilitiesReport(caps: CapabilityDescriptor[]): string[] {
  return caps.map((c) => `[${c.status}] ${c.id}: ${c.name} — ${c.detail}`);
}
