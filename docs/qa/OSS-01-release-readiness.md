# OSS-01 — Open-source repository readiness

**Date:** 2026-10-10  
**Scope:** First public GitHub release readiness (audit only — nothing published, pushed, or registered remotely).  
**Product version:** `0.1.0`

## Verdict

The tree is **close to first-public-repo ready** for a source-based release after the owner confirms licensing/copyright attribution, initializes git + a remote, and completes the checklist below. It is **not** already an open-source project merely because files exist on disk; openness requires an intentional license grant plus publication under that license.

## Unresolved licensing decisions (owner action required)

| Decision | Current state | Action needed |
|----------|---------------|---------------|
| License model | `LICENSE` + `package.json` declare **MIT** | **Confirm** MIT is intentional (see options below if not). |
| Copyright line | `Copyright (c) 2026 OmniSkill contributors` | Replace with the real copyright holder(s) the owner chooses. Do not invent a personal/legal name. |
| Security contact | `SECURITY.md` says “maintainer of this repository” | Add a real private contact once hosting exists. |
| CoC enforcement contact | Placeholder “maintainers’ private channel” | Same as above. |
| `repository` / `homepage` in `package.json` | **Omitted** (correct — URL unknown) | Set only after the public GitHub URL exists. |
| npm name `omniskill` | Local package name only | **Not verified** available on the public npm registry. |

### Practical license options (if MIT is not confirmed)

| License | Typical fit |
|---------|-------------|
| **MIT** | Permissive CLI tooling; simple reuse; matches current files if confirmed |
| **Apache-2.0** | Permissive + explicit patent grant; may need `NOTICE` if required by inbound deps (not required for current MIT runtime deps alone) |
| **GPL-3.0** | Strong copyleft; often awkward for a developer CLI that users embed in workflows |
| **No license / “All rights reserved”** | **Not open source** — others may not legally use/modify/distribute |

**Confirmation requested from the owner before first public release:** keep MIT with an explicit copyright holder line, or name a different SPDX license to apply.

### Third-party / redistribution

- Runtime deps: `commander` (MIT), `zod` (MIT). No `NOTICE` file added — no inbound NOTICE obligation identified for redistributing this project’s own source.
- Seed registry: metadata URLs only; **no** upstream `SKILL.md` bodies shipped in the package.
- Downloaded skills land in user-local `.omni/skills/` and must not be republished from OmniSkill without upstream license review.
- Details: `docs/THIRD_PARTY.md`.

## Completed checks

| Check | Result |
|-------|--------|
| `LICENSE` present | Yes (MIT text; copyright collective placeholder) |
| `package.json` `license` | `MIT` (consistent with file; pending owner confirm) |
| `bin.omniskill` → `./dist/cli.js` | Yes; shebang `#!/usr/bin/env node` present |
| Runtime assets in pack | `dist/data/master-prompt.md`, `dist/data/seed-registry.json` |
| Branding in pack | `assets/branding/*` |
| `files` whitelist | `dist`, `assets/branding`, README, LICENSE, SECURITY, CHANGELOG — excludes tests, coverage, `.omni`, `src` (compiled into `dist`) |
| `npm pack` (via CI step / local) | Succeeded; ~130 files, ~70 kB packed |
| Clean install from tarball | `npx omniskill --help` / `--version` worked (`0.1.0`) |
| Secrets in pack | No `.env`, no `.omni/`, no coverage HTML, no real tokens |
| Docs: README, CONTRIBUTING, SECURITY, CHANGELOG, engines Node ≥20 | Present |
| CoC / ROADMAP / THIRD_PARTY / issue+PR templates / `.env.example` | Added this audit |
| CI workflow defined | `.github/workflows/ci.yml` (not executed on GitHub yet — no remote) |

## Packaging results

```
npm pack (prepack → build)
name: omniskill@0.1.0
~70.4 kB packed / ~307.6 kB unpacked / 130 files
Includes: dist/** (js + maps + d.ts), dist/data/*, assets/branding/*, README, LICENSE, SECURITY, CHANGELOG, package.json
Excludes: src/, tests/, docs/, coverage/, node_modules/, .omni/, SPEC.md, .cursor/
```

Clean install (temp dir): `npm install <tarball>` → CLI help/version OK.

**Caveat:** Package name availability on npm was **not** checked against the registry API as a reserved claim.

## Repository hygiene findings

| Item | Status | Recommendation |
|------|--------|----------------|
| No `.git` directory | **Blocker for GitHub release** | `git init` + first commit when owner authorizes |
| `.gitignore` | Strengthened (`.omni/`, `.env*`, `coverage/`, `dist/`, `*.tgz`, IDE junk) | Keep |
| Local `coverage/` | Present on disk; gitignored; contains absolute machine paths | Safe to delete locally; do not commit |
| `dist/` | Build output; gitignored; required inside npm pack via `prepack` | Do not commit unless owner prefers committing build artifacts (not recommended) |
| `.omni/` | Ignored | Never ship user caches |
| Personal path in QA-01 | Sanitized to omit local absolute path | Scan other QA docs before publish if needed |
| Adversarial fixtures | Synthetic hostile Markdown for tests | Keep; documented in THIRD_PARTY |
| `.cursor/rules/` | Project Cursor rules | Fine to version; not in npm pack |

**Not deleted:** `coverage/` and other local artifacts (reversible cleanup recommended only).

## Documentation gaps (remaining)

| Gap | Severity |
|-----|----------|
| Real GitHub `repository` / `bugs` / `homepage` fields | High before npm publish |
| Real security reporting contact | High before public launch |
| Copyright holder name confirmation | High |
| Executed CI green on GitHub matrix | Medium (workflow exists) |
| npm publish + name claim | Out of scope until owner decides |
| README “Suggested topics” are suggestions only | Informational |

## Community presentation (ready to paste)

- **Description:** Project-aware AI skill router CLI — match tasks to local skill caches and export agent bundles.
- **Topics:** `cli`, `developer-tools`, `ai-skills`, `claude-code`, `cursor`, `typescript`, `nodejs`
- **Limitations / roadmap:** README + `ROADMAP.md` (planned labeled separately)
- **Contribution workflow:** `CONTRIBUTING.md` + issue/PR templates

No stars, users, benchmarks, endorsements, or release history were fabricated.

## Required actions before publication

1. **Confirm license** (MIT or alternative) and **copyright holder** text in `LICENSE`.
2. Initialize git; review `git status` so `coverage/`, `.env`, `.omni/`, `*.tgz` are not staged.
3. Create the GitHub repository **when authorized**; set `package.json` `repository` / attribution URL to the real HTTPS URL only.
4. Add a private security contact to `SECURITY.md` / CoC enforcement.
5. Push and confirm CI matrix is green.
6. Tag `v0.1.0` only after the above; npm publish remains a separate explicit decision.
7. Verify npm name availability before any `npm publish` (do not assume `omniskill` is free).

## Suggested initial release checklist

- [ ] Owner confirms MIT (or replaces LICENSE + `package.json` license)
- [ ] Copyright line finalized
- [ ] `git init` / first commit (authorized)
- [ ] Remote created; no secrets in history
- [ ] CI green on ubuntu/windows/macos × Node 20/22
- [ ] README install path matches hosting (source clone URL)
- [ ] `OMNISKILL_REPO_URL` / config attribution pointed at real repo
- [ ] Security contact published
- [ ] Tag `v0.1.0`
- [ ] (Optional later) npm name check + publish — not part of this audit

## Safe improvements made in this audit

- Strengthened `.gitignore`
- Added `.env.example`, `CODE_OF_CONDUCT.md`, `ROADMAP.md`, `docs/THIRD_PARTY.md`
- Added GitHub issue + PR templates
- Expanded README (features, limitations, license caveat, skill trust, topics)
- Updated `CONTRIBUTING.md`, `CHANGELOG.md`
- Sanitized personal absolute path in `QA-01`
- Verified `npm pack` + clean CLI install (no publish)

## Explicit non-actions

- No `git push`, no GitHub/npm publish, no external contacts
- No `NOTICE` invented without obligation
- No invented copyright person or repository URL in `package.json`
