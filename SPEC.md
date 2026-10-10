# OmniSkill Specification

This document is the product specification for OmniSkill. Implementation and QA must follow it. The authoritative engineering requirements originated from the Master Engineering Prompt; this file summarizes normative behavior for contributors and Cursor sessions.

## Product

OmniSkill is a project-aware AI skill router and agent workflow enhancement CLI. It discovers, caches, matches, and exports third-party agent skills for Claude Code, Cursor, and portable Markdown workflows.

It is **not** a chatbot, static prompt pack, mockup, or thin LLM API wrapper.

## Non-negotiables

- Deterministic matching by default; no API key required for core workflow.
- Optional `GITHUB_TOKEN` for higher GitHub rate limits only.
- Never execute downloaded skill content.
- Never overwrite user-authored instruction regions outside OmniSkill markers.
- Never fabricate GitHub stats, test results, or success rates.
- Distinguish discovered / cached / selected / loaded / attempted / verified / unverified.

## Commands

`init`, `scan`, `add`, `sync`, `list`, `match`, `export`, `log`, `feedback`, `doctor`,
`classify`, `discover`, `plan`, `context`, `capabilities`, `approve`,
plus `--help` / `--version`.

## Domains

OmniSkill is domain-agnostic at the router layer. Deterministic classification may label tasks as
software, business, writing, social, research, design, education, or general — including mixed-domain
tasks. Matching uses skill metadata (`domains`, `triggers`, optional `kind` / `requiredCapabilities`).

## Orchestration

`plan` builds staged workflows with capability checks. Skills never substitute for missing tools.
Project context under `.omni/context.json` is **opt-in**. See `docs/qa/GENERAL-PURPOSE-ORCHESTRATION.md`.

## Local layout

```
.omni/
  profile.json
  skill-registry.json
  config.json
  log.jsonl
  skills/<skill-id>/SKILL.md
  bundles/
  backups/
```

## Trust model

See `SECURITY.md`. Seed sources are discovery hints, not endorsements.

## Milestones

See section 11 of the Master Engineering Prompt / QA checklist in `docs/qa/`.
