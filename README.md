# OmniSkill

<img src="./assets/branding/omniskill-logo.svg" alt="OmniSkill" width="280" />

**Universal AI capability platform** — describe an outcome; OmniSkill classifies the work, searches skills/tools via providers, plans a workflow, executes authorized stages with checkpoints, and tracks verified artifacts. Media render uses real tools (e.g. FFmpeg) when installed — never claimed without verification.

> Suggested repository description: `Project-aware AI skill router CLI — match tasks to local skill caches and export agent bundles.`  
> Suggested GitHub topics: `cli`, `developer-tools`, `ai-skills`, `claude-code`, `cursor`, `typescript`, `nodejs`

## Features (implemented)

- Fingerprints the current repository into `.omni/profile.json`
- Seeds and validates a local skill registry (software + business/writing/social/research/design placeholders)
- Adds/syncs skills from public GitHub repositories (optional `GITHUB_TOKEN`) and local `SKILL.md` dirs
- Deterministic multi-domain task classification (`classify`)
- Matches tasks to skills offline with explainable scores; evaluates provenance/license/security heuristics (`discover`)
- Multi-stage workflow plans with missing-capability honesty (`plan`)
- Opt-in project context (`context`) and environment capability report (`capabilities`)
- Manual skill trust decisions (`approve` / `--reject` / `--quarantine`)
- Builds task bundles under `.omni/bundles/` with provenance
- Installs an OmniSkill-managed instruction block without wiping user content

## What it does not do

- Guarantee that an agent will obey skill instructions
- Execute downloaded skill scripts
- Require an LLM API key for core commands
- Fabricate stars, success rates, or unverified outcomes
- Auto-promote/demote skills from a single feedback event
- Redistribute upstream skill bodies as part of the OmniSkill package

## Requirements

- Node.js 20+
- npm 9+
- Network access only for `add` / `sync` / optional `doctor --online`

## Installation (from source)

This package has **not** been published to npm as part of the verified work in this repository. The npm name `omniskill` in `package.json` is a **local package name**, not a confirmation that the name is available on the public registry.

Install from a checkout:

```bash
npm install
npm run build
npm link   # optional: exposes `omniskill` globally from this checkout
```

Or run directly:

```bash
node dist/cli.js --help
```

Optional environment variables: see [`.env.example`](./.env.example) (`GITHUB_TOKEN`, `OMNISKILL_REPO_URL`).

## Quick start

```bash
cd your-project
omniskill init            # creates .omni + prints instruction preview
omniskill init --yes      # also installs managed agent instructions
omniskill match "Add authentication to the application" --explain
omniskill export "Add authentication to the application" --agent claude-code
```

Example on a Next.js-like fixture after init:

```bash
omniskill match "Build a dark mode toggle" --explain
```

Seed catalog entries for frontend UI and Vitest are intended to rank highly for that task when present.

## Commands

| Command | Purpose |
|---------|---------|
| `omniskill init [--agent] [--yes] [--dry-run] [--json]` | Create `.omni/`, scan, seed registry, install instructions |
| `omniskill scan [--json]` | Refresh project profile |
| `omniskill add <owner/repo\|url> [--json]` | Discover `SKILL.md` files and cache them |
| `omniskill sync [--source <id>] [--json]` | Re-sync registered sources |
| `omniskill list [--domain] [--json]` | List skills |
| `omniskill match "<task>" [--all] [--limit N] [--json] [--explain]` | Rank skills |
| `omniskill export "<task>" [--agent] [--json] [--no-attribution]` | Write a bundle (does not overwrite user docs) |
| `omniskill log [--last N] [--json]` | Show events / aggregates |
| `omniskill feedback --skills id1,id2 [--relevant\|--no-relevant] [--helpful\|--no-helpful]` | Record feedback |
| `omniskill doctor [--online] [--json]` | Diagnostics |
| `omniskill classify "<task>" [--json]` | Domain / deliverable / capability classification |
| `omniskill discover "<task>" [--local] [--preview] [--json]` | Evaluate skills for a task |
| `omniskill plan "<task>" [--format md\|json] [--no-write] [--json]` | Multi-stage workflow plan |
| `omniskill context [--enable\|--disable\|--set\|--delete\|--clear\|--export] [--json]` | Opt-in project context |
| `omniskill capabilities [--json]` | What this environment can actually do |
| `omniskill approve <skillId> [--reject\|--quarantine] [--json]` | Trust decision after inspection |
| `omniskill search "<outcome>" [--offline] [--import-local] [--json]` | Universal capability search (skills + tools) |
| `omniskill tools [--probe] [--json]` | Capability registry tools/models; probe host binaries |
| `omniskill run "<outcome>" [--approve ids] [--media] [--json]` | Execute workflow with checkpoints |
| `omniskill artifacts [--json]` | List artifacts + verification checks |

Architecture: [`docs/architecture/UNIVERSAL-PLATFORM.md`](./docs/architecture/UNIVERSAL-PLATFORM.md), adapters [`docs/architecture/ADAPTERS.md`](./docs/architecture/ADAPTERS.md), media [`docs/architecture/MEDIA.md`](./docs/architecture/MEDIA.md).

Exit codes: `0` success, nonzero for real failures (invalid registry, not initialized, doctor FAIL, etc.).

### Multi-domain example

```bash
omniskill classify "Arabic launch reel with market research and storyboard" --json
omniskill discover "Arabic launch reel with market research and storyboard" --preview
omniskill plan "Arabic launch reel with market research and storyboard"
omniskill capabilities
```

If video tools are unavailable, plans stay at storyboard/script/production-package fidelity — OmniSkill will not claim a finished MP4.

## Registry structure

`.omni/skill-registry.json` contains `sources[]` and `skills[]` validated with Zod on every read. Invalid registries are rejected with actionable errors (not silently replaced).

Seed discovery sources (unreviewed metadata pointers only — see [docs/THIRD_PARTY.md](./docs/THIRD_PARTY.md)):

- `anthropics/skills`
- `travisvn/awesome-claude-skills`
- `ComposioHQ/awesome-claude-skills`
- `obra/superpowers`

### Third-party skill trust

Downloaded `SKILL.md` files are **untrusted third-party guidance**. OmniSkill never executes skill scripts, and bundles keep OmniSkill security policy separate from skill bodies. Review licenses and content before relying on a skill; caching a skill locally is not permission to republish it. See [SECURITY.md](./SECURITY.md).

## GitHub discovery

`add` / `sync` use the GitHub repository metadata and Git Trees API, then fetch individual `SKILL.md` files via `raw.githubusercontent.com`. Entire repositories are not cloned. Rate limits, 404s, timeouts, oversized payloads, and unsafe paths are handled as errors.

## Claude Code

`init --agent claude-code` (default) upserts a managed block in `CLAUDE.md` between:

```html
<!-- OMNISKILL:BEGIN -->
<!-- OMNISKILL:END -->
```

User content outside the markers is preserved. A backup is written under `.omni/backups/` before modifying an existing file. Reload/restart the agent if it caches instructions.

OmniSkill does **not** install into Claude Code’s `.claude/skills/` directory. It points the agent at `.omni/` and task bundles. Bundles are not auto-executed by Claude Code unless you attach them.

## Cursor

`init --agent cursor` writes a dedicated `.cursor/rules/omniskill.mdc` file that **starts with YAML frontmatter** (`alwaysApply: true`), matching Cursor’s documented project rules format. The whole file is OmniSkill-managed (backed up before overwrite).

OmniSkill does **not** claim Cursor auto-discovers `.omni/bundles/` exports.

## Portable export

```bash
omniskill export "your task" --agent portable
```

Produces Markdown under `.omni/bundles/`. This is **not** a native agent integration — attach the file manually.

## CI platforms

GitHub Actions workflow `.github/workflows/ci.yml` runs build/tests on `ubuntu-latest`, `windows-latest`, and `macos-latest`. Results are only verified after that workflow has actually run on GitHub.

## Offline behavior

After skills are cached, `match`, `list`, `export`, `log`, `feedback`, and offline `doctor` work without network access. `add` / `sync` require GitHub connectivity (or fail with recovery hints).

## Branding and attribution

Visual identity assets live under [`assets/branding/`](./assets/branding/) (mark, logo, and [BRAND.md](./assets/branding/BRAND.md)).

### What is attributed

| Artifact | Branding / attribution |
|----------|------------------------|
| CLI `--help` / human `init` | Single identity line (name, version, tagline). No ASCII banners on every command. |
| Generated Markdown bundles | Optional italic footer: `Generated with OmniSkill · <repo-url>` when a URL is known |
| Managed agent config (`CLAUDE.md` block, Cursor rule) | Short “Managed by OmniSkill” comment when the format allows |
| Cached third-party `SKILL.md` | **Never** modified for watermarks |
| User source files | **Never** branded by default |

Bundles include a **Provenance** section that separates OmniSkill-authored structure, third-party skill bodies, and project profile summary. OmniSkill does not claim ownership of third-party instructions.

### Repository URL

The public repository URL is never invented. Resolution order:

1. `.omni/config.json` → `attribution.repositoryUrl`
2. Environment variable `OMNISKILL_REPO_URL`
3. `package.json` `repository` / `homepage` (when valid `https:`)

If none is set, the footer is `Generated with OmniSkill` without a link.

### Customize or disable

```json
{
  "attribution": {
    "enabled": true,
    "repositoryUrl": "https://github.com/OWNER/REPO",
    "footerText": "Optional fully custom footer"
  }
}
```

- Set `attribution.enabled` to `false` to omit footers by default.
- Per export: `omniskill export "task" --no-attribution`
- `NO_COLOR` / non-TTY: CLI identity stays plain text (no ANSI).
- `--json`: machine-readable output only; no identity banners on stdout.

See [docs/qa/BRAND-01-attribution.md](./docs/qa/BRAND-01-attribution.md).

## Security and privacy

See [SECURITY.md](./SECURITY.md). Logs redact common secret patterns and do not store full source files by default. Task text is summarized unless `privacy.logRawTask` is enabled in `.omni/config.json`.

## Troubleshooting

| Symptom | Action |
|---------|--------|
| `NOT_INITIALIZED` | Run `omniskill init` |
| `REGISTRY_INVALID` | Fix `.omni/skill-registry.json`; check `.omni/backups/` |
| GitHub rate limit | Set `GITHUB_TOKEN`, retry later |
| No match above threshold | Use `--all`, add sources, or lower `matching.minScore` in config |
| Marker errors | Repair BEGIN/END pair manually |

## Sample fixture

See `tests/fixtures/sample-next/` for a minimal Next-like manifest used in docs/examples.

## Tests

```bash
npm run build
npm test
npm run test:coverage
npm run typecheck
```

Integration tests require a prior `npm run build`. Optional live GitHub smoke:

```bash
OMNISKILL_LIVE_GITHUB=1 npm run test:live-github
```

See `docs/qa/QA-02-regression.md` for the regression strategy and measured coverage, and `docs/qa/QA-03-security-review.md` for the security review (not an external penetration test).

## Current limitations

- Optional LLM-assisted matching is not implemented (by design for 0.1.0).
- Live GitHub smoke tests are not required in CI; HTTP behavior is covered with fixtures.
- Cross-platform CI is defined in `.github/workflows/ci.yml` but only verified after that workflow actually runs on GitHub.
- Seed skills include offline matching metadata; run `add`/`sync` to obtain real upstream instruction bodies.
- No public git remote or npm publication has been performed from this audit work.

Planned vs implemented items: [ROADMAP.md](./ROADMAP.md).

## License

[MIT](./LICENSE) © 2026 Laith Abu-Saleem.

Third-party dependency and skill-source notes: [docs/THIRD_PARTY.md](./docs/THIRD_PARTY.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Security reporting: [SECURITY.md](./SECURITY.md).
