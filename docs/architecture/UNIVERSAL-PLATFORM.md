# OmniSkill Universal Capability Platform

## Phase 1 — Gap analysis (current tree)

| Area | Existing | Gap |
|------|----------|-----|
| Skill registry | `.omni/skill-registry.json` + Zod | No unified Tools/Models/Workflows/Agents registry |
| Discovery | GitHub `add`/`sync`, local dirs | No provider interface; no tool/MCP/model discovery |
| Classification / planning | Deterministic classifier + templates | Plan ≠ execute; limited templates |
| Execution | None (export bundles only) | Need dependency-aware engine + checkpoints |
| Media | Capability flags only | No FFmpeg/Blender adapters or render verification |
| Artifacts | Bundles/plans as files | No typed artifact manifest |
| Plugins | Hardwired commands | Need stable adapter contracts |
| Agents | Claude/Cursor/portable instruction adapters | Not execution agents |

**Strategy:** Layer a `src/platform/` package beside existing `src/core/` without breaking the skill router CLI. Reuse classifier, planner, matcher, security, and cache.

## Concepts (non-interchangeable)

- **Skill** — instructions / procedures (not executable by OmniSkill as code)
- **Tool** — local CLI, app, library, API, MCP server
- **Model** — LLM / image / audio / video model endpoints
- **Workflow** — ordered stages with gates
- **Agent** — host agent adapter (planning vs execution distinguished)

## Status vocabulary

`discovered` → `installed` → `configured` → `available` → `executed` → `verified`

Never skip to `verified` without a check that actually ran.
