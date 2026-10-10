# Roadmap

This document separates **implemented** behavior (shipped in the current tree)
from **planned** ideas. Planned items are not commitments or release guarantees.

## Implemented (0.1.0)

- Local project scan → `.omni/profile.json`
- Seeded skill registry with Zod validation
- GitHub `SKILL.md` discovery (`add` / `sync`) with local cache
- Deterministic offline task → skill matching
- Bundle export with provenance and optional attribution
- Managed Claude Code / Cursor / portable instruction adapters
- Logging, feedback recording (preview recommendations), `doctor`
- Unit/integration tests and GitHub Actions CI workflow definition

## Planned (not implemented)

| Item | Notes |
|------|--------|
| Optional LLM-assisted matching | Explicitly out of scope for 0.1.0 core |
| npm registry publication | Not performed; name availability unverified |
| Signed releases / provenance attestations | After public hosting exists |
| Broader skill-source allowlists beyond GitHub | Security review required first |
| Automatic skill promotion/demotion from feedback | Feedback is recorded only today |
| Native deep agent integrations | Bundles/adapters are guidance, not agent runtime guarantees |

## Non-goals

- Executing downloaded skill scripts
- Claiming ownership of third-party skill content
- Guaranteeing agent compliance with exported instructions
