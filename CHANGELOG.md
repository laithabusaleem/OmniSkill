# Changelog

## 0.1.0 — 2026-10-10

Universal capability platform foundation:

- Capability registry (skills/tools/models/workflows/agents metadata)
- Provider-based `search`, host `tools --probe`, workflow `run`, `artifacts`
- Execution engine with approvals, jobs, artifact manifests
- FFmpeg media adapter (probe + verified synthetic render when installed)
- Adapter contracts and architecture docs under `docs/architecture/`

General-purpose orchestration expansion:

- Deterministic multi-domain task classification (`classify`)
- Local skill discovery + evaluation (`discover`)
- Workflow planner with capability honesty (`plan`)
- Opt-in project context (`context`) and capability registry (`capabilities`)
- Skill trust decisions (`approve`)
- Multi-domain seed catalog placeholders (business, writing, social, research, design)

Initial implementation:

- Project scanner and `.omni/profile.json`
- Seeded skill registry with Zod validation
- GitHub discovery (`add` / `sync`) with caching
- Deterministic offline matcher
- Bundle export and agent adapters (Claude Code, Cursor rule file, portable Markdown)
- Safe instruction installation with markers and backups
- Logging, feedback recommendations (preview only), and `doctor`
- Branding assets and optional attribution for generated bundles
- Unit and integration tests; OSS readiness docs (`ROADMAP`, `CODE_OF_CONDUCT`, third-party notes)

Not claimed: npm publication, executed multi-OS CI on GitHub, or live GitHub skill-count guarantees.
