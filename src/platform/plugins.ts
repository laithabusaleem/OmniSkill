import type { PlatformPlugin } from "./adapters/contracts.js";
import { FfmpegAdapter } from "./media/ffmpeg-adapter.js";
import { GitHubSkillDiscoveryProvider } from "./discovery/github-provider.js";
import { LocalSkillDiscoveryProvider } from "./discovery/local-provider.js";
import { LocalToolsDiscoveryProvider } from "./discovery/local-tools-provider.js";

const plugins: PlatformPlugin[] = [];

export function registerPlugin(plugin: PlatformPlugin): void {
  if (plugins.some((p) => p.id === plugin.id)) return;
  plugins.push(plugin);
}

export function listPlugins(): PlatformPlugin[] {
  return [...plugins];
}

/** Built-in plugin registered at process start. */
export function registerBuiltinPlugins(): void {
  registerPlugin({
    id: "omniskill.builtin",
    discoveryProviders: [
      new LocalSkillDiscoveryProvider(),
      new GitHubSkillDiscoveryProvider(),
      new LocalToolsDiscoveryProvider(),
    ],
    media: [new FfmpegAdapter()],
    tools: [new FfmpegAdapter()],
    agents: [
      {
        id: "agent.portable",
        name: "Portable",
        planHint: (task) => `Export a reviewable Markdown plan/bundle for: ${task}`,
      },
    ],
  });
}

let builtinsReady = false;
export function ensureBuiltinPlugins(): void {
  if (!builtinsReady) {
    registerBuiltinPlugins();
    builtinsReady = true;
  }
}
