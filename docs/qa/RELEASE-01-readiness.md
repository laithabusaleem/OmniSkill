# RELEASE-01 — Final release candidate verification

**Role:** Release manager  
**Date:** 2026-10-10  
**Product version:** `0.1.0`  
**Scope:** Determine readiness for the first **public** release. No publish, tag, push, or remote repository creation was performed.

## Overall release recommendation

### **NOT READY**

Technical build, tests, packaging, CLI workflows, security regressions, branding/attribution, and (optional) live GitHub smoke **passed** in this verification. The repository is a strong **technical release candidate**.

Public release is still **NOT READY** because unresolved **licensing / copyright confirmation** blocks the intended open-source distribution, and there is **no git repository** (and therefore no GitHub remote/CI execution) for a controlled first publication.

After the blockers below are cleared by the owner, the expected posture becomes **READY WITH LIMITATIONS** (documented product limits remain).

---

## Verification environment

| Item | Value |
|------|--------|
| OS | Windows 10 (build 26200) |
| Node.js | v24.21.0 |
| npm | 11.19.0 |
| Install method | `npm ci` from `package-lock.json` (clean `node_modules`) |
| Git | **Not initialized** (`Test-Path .git` → false) |
| Lint | **Not configured** (no eslint / lint script) |
| Live network | Available — optional GitHub smoke executed |

---

## Checks performed and results

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| 1 | Clean install from lockfile | **PASS** | `npm ci` exit 0 (124 packages); npm warned about deprecated `glob@10.5.0` (dev transitive) |
| 2 | Production build | **PASS** | `npm run build` exit 0; `dist/data/*` copied |
| 3 | Full automated tests | **PASS** | `npm test` → **149 passed**, **1 skipped** (live GitHub suite gated) |
| 4 | Typecheck | **PASS** | `npm run typecheck` exit 0 |
| 4b | Linting | **N/A** | No lint tool/script configured — not treated as a failure |
| 5 | CLI help / version | **PASS** | `--version` → `0.1.0`; `--help` lists all SPEC commands + identity line |
| 6–10 | Init / preserve / re-init | **PASS** | `scripts/rc-verify.mjs`: user `CLAUDE.md` preserved; `OMNISKILL:BEGIN` count stays `1` after second `init --yes` |
| 7 | scan / list / match / export / log / feedback / doctor | **PASS** | Same RC script; scan detected `nextjs,react`; list `3` seed skills; match selected seed skills; doctor JSON returned |
| 7b | add / sync | **PASS** (live) | `add anthropics/skills` discovered 20 / registered 18; `sync` exit 0 |
| 8 | Offline with cache | **PASS** | Match succeeded with cached skill bodies / empty `GITHUB_TOKEN` |
| 11 | Package contents / bin | **PASS** | `npm pack` → 130 files, ~71 kB; clean install → `npx omniskill --version` = `0.1.0`; runtime pack has **0** npm audit vulns; no `.env`/`.omni`/tests/`src` in tarball |
| 12 | Security regression tests | **PASS** | `security.test.ts` + `security-adversarial.test.ts` → 20 tests passed |
| 13 | Branding / attribution | **PASS** | `branding.test.ts` 11 passed; RC export footer + `--no-attribution` verified |
| 14 | README vs CLI | **PASS*** | Commands match help; `--no-attribution` documented (commands table updated during this gate) |
| 15 | Diff / secrets / caches | **PASS (hygiene)** | No `.env` or `.omni` in repo root; no git → no `git diff`; local `coverage/` present but gitignored; no committed secrets found |

\* Minor doc gap fixed: export row in README now includes `--no-attribution`.

### Optional live GitHub smoke

Executed separately via `scripts/rc-verify.mjs` (not part of default `npm test`):

- `add anthropics/skills` → ok  
- `sync` → ok  

Default suite still skips `tests/integration/github-live.test.ts` unless `OMNISKILL_LIVE_GITHUB=1`.

### npm audit (workspace after `npm ci`)

| Severity | Count | Notes |
|----------|-------|--------|
| critical | 2 | `vitest` / `tinypool` (**devDependencies only**) |
| moderate | 2 | `@vitest/*` (**devDependencies only**) |
| published runtime pack | **0** | Clean install of tarball reported 0 vulnerabilities |

Dev-tooling vulns are a **contributor** concern, not a runtime CLI supply-chain finding for end users of the packed package. Do not weaken security tests to “fix” audit.

---

## Release blockers

| ID | Blocker | Severity | Remediation |
|----|---------|----------|-------------|
| B1 | License / copyright not owner-confirmed | **Release-blocking** for intended OSS distribution | Owner confirms MIT (or chooses another SPDX license) and sets the real copyright holder in `LICENSE` (replace collective placeholder “OmniSkill contributors” if desired). |
| B2 | No `.git` repository | **Release-blocking** for GitHub first release | Owner authorizes `git init`, reviews staged files (exclude `coverage/`, `dist/`, `.omni/`, secrets), creates remote, pushes when ready. |
| B3 | No private security reporting contact | **High** for public launch | Add a real contact / private intake to `SECURITY.md` (and CoC enforcement) before inviting reports. |

These are **not** product defects found in CLI behavior during this gate.

---

## Noncritical improvements (not blockers)

- Upgrade Vitest (or pin) to clear **devDependency** audit findings for contributors.
- Execute GitHub Actions CI matrix on a real remote (workflow exists; not run on GitHub yet).
- Set `package.json` `repository` / `homepage` only after the public URL exists (do not invent).
- Verify npm name availability before any `npm publish` (name `omniskill` is unverified on the registry).
- Optional: add a lint script if the owner wants style gating in CI.
- Local `coverage/` directory may be deleted anytime (gitignored; contains machine-local paths).

---

## Known limitations (product — acceptable for 0.1.0 if published after blockers)

- Seed registry ships **metadata**, not full upstream skill bodies; `add`/`sync` required for real instructions.
- Optional LLM-assisted matching not implemented (by design).
- Prompt-injection risk against agents remains residual after any skill download (documented in `SECURITY.md`).
- Agent obedience to bundles/instructions is not guaranteed.
- Cross-platform packaging was verified via Windows host + workflow definition; macOS/Linux CI not executed on GitHub in this environment.
- Attribution repository URL omitted until configured (never invented) — footer is `Generated with OmniSkill` without link by default.

---

## Packaging results

```
npm pack → omniskill-0.1.0.tgz
files: 130
packed ≈ 71.1 kB
unpacked ≈ 309.6 kB
bin: omniskill → ./dist/cli.js (shebang present)
includes: dist/** (+ dist/data), assets/branding/**, README, LICENSE, SECURITY, CHANGELOG, package.json
excludes: src/, tests/, docs/, coverage/, .omni/, .env*, node_modules/
clean install: runtime deps commander + zod only; CLI --help / --version OK; npm audit 0
```

---

## Outstanding legal / licensing decisions

1. Confirm **MIT** (already present in `LICENSE` + `package.json`) or replace with another license.  
2. Finalize **copyright holder** text.  
3. Publish a **security contact**.  
4. Do not claim open source until the license grant is intentional and the tree is published under it.  
5. Do not redistribute cached third-party skills from user `.omni/` without upstream license review (`docs/THIRD_PARTY.md`).

See also `docs/qa/OSS-01-release-readiness.md`.

---

## Exact remediation steps for blockers

1. **License:** Reply with confirmation of MIT (or alternate SPDX id) and the copyright line to use; update `LICENSE` accordingly.  
2. **Git:** When authorized — `git init`, ensure `.gitignore` excludes `node_modules/`, `dist/`, `coverage/`, `.omni/`, `.env*`, `*.tgz`; commit; create GitHub repo; set remote; push.  
3. **Security contact:** Add email or private security intake URL to `SECURITY.md`.  
4. **Re-run gate:** `npm ci` → `npm run build` → `npm run typecheck` → `npm test` → `node scripts/rc-verify.mjs` → `npm pack` + clean install.  
5. **Then** tag `v0.1.0` / publish only with explicit owner approval (out of scope for this document).

---

## Related QA reports (spot-checked against current tree)

| Report | Spot-check |
|--------|------------|
| QA-01 | Historical; personal path sanitized |
| QA-02 | Aligns with current test strategy |
| QA-03 | Security fixes present; adversarial suite still green |
| QA-04 | Compatibility claims remain environment-honest |
| BRAND-01 | Branding tests still pass |
| OSS-01 | Licensing blockers still accurate |

---

## Helper added this gate

- `scripts/rc-verify.mjs` — repeatable temp-project RC workflow (init→doctor, offline match, optional live add/sync). Not published in the npm `files` whitelist.

---

## Bottom line

| Gate | Status |
|------|--------|
| Technical RC (build/test/CLI/pack/security/brand) | **PASS** |
| Public release recommendation | **NOT READY** until B1–B3 cleared |
| After B1–B3 | Expect **READY WITH LIMITATIONS** for `0.1.0` source release |
