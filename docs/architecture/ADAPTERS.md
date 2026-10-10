# Adapter development guide

OmniSkill plugins implement stable contracts in `src/platform/adapters/contracts.ts`.

## Register a plugin

```ts
import { registerPlugin } from "../platform/plugins.js";

registerPlugin({
  id: "my.org.plugin",
  discoveryProviders: [/* DiscoveryProvider */],
  tools: [/* ToolAdapter */],
  media: [/* MediaProcessor */],
  models: [/* ModelProvider */],
  agents: [/* AgentAdapterContract */],
});
```

Call `registerPlugin` from your package entry, or add to `registerBuiltinPlugins()` while developing in-tree.

## Contracts

| Interface | Responsibility |
|-----------|----------------|
| `DiscoveryProvider` | Targeted search; explain coverage/uncertainty |
| `ToolAdapter` | `probe()` before claiming `available`; optional `execute()` |
| `MediaProcessor` | Media ops + verification of output files |
| `ModelProvider` | Probe credentials/cost; never silent paid calls |
| `AgentAdapterContract` | Planning hints; execution only if implemented |

## Rules

1. Never set lifecycle `verified` without a check that ran.
2. Skills are not tools — do not execute downloaded instructions as code.
3. Prefer derived output paths under `.omni/artifacts/`.
4. Request explicit permissions (`shell`, `publish`, `spend_money`, …).
5. Add unit tests with mocks; skip integration when binaries are missing.

## Example probe

See `src/platform/media/ffmpeg-adapter.ts`.
