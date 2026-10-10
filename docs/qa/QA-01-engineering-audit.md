# QA-01 Engineering Audit — OmniSkill

**Auditor role:** Independent senior QA (post-implementation review)  
**Audit date:** 2026-10-10  
**Workspace:** local OmniSkill checkout (path omitted for release hygiene)  

**Node:** v24.21.0 · **npm:** 11.19.0  
**Product version audited:** `0.1.0` (source + `dist/` after build)

---

## Executive summary

**At audit start the workspace was empty** (0 files in `OmniSkill_ByLaith` and sibling `Omniskill`). There was no implementation to review, so every SPEC requirement was **Missing** — a Critical release blocker (C-01).

During this audit session the product was implemented to satisfy C-01, then re-audited against `SPEC.md` / the Master Engineering Prompt with build, typecheck, Vitest, `npm pack --dry-run`, and real CLI smoke runs in temporary directories.

**Post-remediation verdict:** Core CLI workflow is **functionally present and verified on Windows** for offline init/scan/list/match/export/log/feedback/doctor and fixture-backed GitHub acquisition. This is **not** a claim that OmniSkill “passed audit because tests passed.” Remaining gaps are documented below (live GitHub smoke, multi-OS packaging, optional LLM matching intentionally absent, seed skills without synced bodies, vitest transitive audit advisories).

| Gate | Result |
|------|--------|
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 48/48 |
| CLI smoke (temp project) | PASS — all required commands exercised |
| `npm pack --dry-run` | PASS — includes `dist/` + `dist/data/*` runtime assets |
| Live GitHub `add`/`sync` | NOT RUN in this audit (fixtures only) |
| macOS / Linux | NOT RUN |

---

## Requirement coverage matrix

Legend: `I` Implemented · `P` Partial · `M` Missing · `X` Incorrect (fixed if noted)

| SPEC area | T0 | Post-fix | Evidence |
|-----------|----|------------|----------|
| §4 Stack (Node20+, TS strict, ESM, Commander, Zod, Vitest) | M | I | `package.json`, `tsconfig.json` strict, `npm run typecheck` |
| §5 Architecture (commands/core/tests) | M | I | `src/commands/*`, `src/core/*`, `tests/**` |
| §6.1 Scanner → `.omni/profile.json` | M | I | `src/core/scanner.ts`, unit tests, CLI `scan` |
| §6.2 Registry Zod + seed + no silent replace | M | I | `src/core/registry.ts`, seed JSON, invalid-schema tests |
| §6.3 GitHub add/sync/cache/safety | M | I | `fetcher.ts`, `sync.ts`, fixture tests (404/rate/timeout/oversize/traversal) |
| §6.4 Skill parser | M | I | `skill-parser.ts` + unit tests |
| §6.5 Deterministic matcher ≤5 + explain | M | I | `matcher.ts` + dark-mode ranking test |
| §6.6 Bundle builder + limits + untrusted boundary | M | I | `bundle-builder.ts` + unit tests |
| §6.7 Agent adapters (Claude/Cursor/portable) | M | I | `agent-adapters.ts`; portable marked `native: false` |
| §6.8 Safe installer markers/backup/dry-run | M | I | `installer.ts` + unit tests |
| §6.9 Master prompt | M | I | `src/data/master-prompt.md` copied to `dist/data` |
| §6.10 Log + feedback (no auto registry mutate) | M | I | `logger.ts`, `feedback-engine.ts` |
| §6.11 Doctor offline-safe | M | I | `doctor.ts`; online only with `--online` |
| §6.12 JSON + exit codes | M | I | CLI `--json`; nonzero on failures |
| §7 All CLI commands | M | I | `src/cli.ts` + integration + smoke |
| §8 Security/privacy | M | I | `security.ts`, `SECURITY.md`, redaction tests |
| §9 Tests breadth | M | P | Core modules covered; live network smoke absent; some edge cases listed under findings |
| §10 Documentation honesty | M | I | README discloses unpublished npm, OS limits, seed placeholders |
| Optional LLM matching | M | M | Intentionally not shipped (SPEC: optional, off by default) |
| Interactive init confirmation | M | I | Fixed H-01: requires `--yes` / `--dry-run` to write instructions |

---

## Findings

### Critical

#### C-01 — Empty product workspace at audit start
- **Evidence:** `dir /a` → `0 File(s)` for both Desktop OmniSkill folders; glob `**/*` → 0 matches before remediation.
- **Impact:** No build, tests, or CLI; all DoD criteria failed.
- **Repro:** Inspect empty workspace prior to implementation.
- **Fix applied:** Full 0.1.0 implementation landed in-repo (see Fixes).

### High

#### H-01 — `init` installed agent instructions without confirmation
- **Evidence (pre-fix):** `src/commands/init.ts` installed even when `--yes` was absent (empty `if (!options.yes)` block).
- **SPEC:** §6.8 / §7 init — install after preview or confirmation.
- **Repro (historical):** `omniskill init` without flags wrote `CLAUDE.md`.
- **Fix applied:** Instruction install skipped unless `--yes` or `--dry-run`; regression in `tests/unit/init-confirm.test.ts`.
- **Verified:** Without `--yes`, `CLAUDE.md` absent; with `--yes`, created. Integration tests use `--yes`.

#### H-02 — `defaultConfig()` threw ZodError on `{}` (broken core path)
- **Evidence:** Vitest failures: `OmniConfigSchema.parse({})` required `schemaVersion` literal without default; matcher/fetcher/bundle/init paths crashed.
- **Repro:** Call `defaultConfig()` before fix → ZodError `invalid_literal` on `schemaVersion`.
- **Fix applied:** `schemaVersion: z.literal(1).default(1)` + `parse({ schemaVersion: 1 })`; regression `tests/unit/config.test.ts`.
- **Verified:** 48/48 tests pass after fix.

### Medium

#### M-01 — Seed skills are metadata placeholders until sync
- **Evidence:** `src/data/seed-registry.json` `cacheStatus: "none"` and reviewNotes state placeholders; export warns missing cache.
- **Impact:** Match works offline; instruction bodies unavailable until `add`/`sync`.
- **Status:** Disclosed in README; not treated as fake live skills. Acceptable for 0.1.0 if docs stay honest.

#### M-02 — Live GitHub discovery not smoke-tested in this audit
- **Evidence:** Acquisition tests use mocked `fetch` only; no successful live `omniskill add owner/repo` run recorded here.
- **Status:** Remaining blocker for production confidence; fixture coverage exists.

#### M-03 — npm audit reports critical advisories in Vitest toolchain
- **Evidence:** `npm audit` → 2 critical, 1 moderate via `vitest` / `@vitest/mocker` / `tinypool` (devDependency tree).
- **Impact:** Affects contributors running tests; published runtime deps are only `commander` + `zod`.
- **Status:** Open; not force-upgraded (`npm audit fix --force` can break Vitest).

#### M-04 — Multi-OS packaging/execution unverified
- **Evidence:** All commands executed on Windows 10 only.
- **Status:** Open; code uses `node:path` / cross-platform APIs but macOS/Linux not run.

### Low

#### L-01 — CLI uses `as AgentKind` casts for Commander string options
- **Evidence:** `src/cli.ts` casts `--agent` strings.
- **Impact:** Invalid agent values may fail later inside adapter switch rather than at parse time.
- **Status:** Open (non-blocking).

#### L-02 — Init unit tests previously printed JSON to stdout when `json: true`
- **Evidence:** Observed during test run noise.
- **Fix:** Tests now omit `json: true` and assert filesystem effects only.

#### L-03 — No dedicated ESLint config / lint script
- **Evidence:** `package.json` has no `lint` script; audit used `tsc --noEmit` only.
- **Status:** Open; typecheck covers strict TS but not style lint.

---

## Fixes applied

1. **C-01:** Implemented OmniSkill CLI (commands, core, seed data, docs, Cursor rule, tests).
2. **H-02:** Fixed Zod config defaults; added `tests/unit/config.test.ts`.
3. **H-01:** `init` requires `--yes`/`--dry-run` for instruction writes; added `tests/unit/init-confirm.test.ts`; README updated.
4. Packaging asset copy via `scripts/copy-assets.mjs` so `dist/data/seed-registry.json` and `master-prompt.md` ship in `npm pack`.

---

## Tests executed and results

| Command | Result |
|---------|--------|
| `npm install` | OK (56 packages) |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | **PASS 48/48** (11 files) |
| `npm pack --dry-run` | PASS — 123 files; includes `dist/data/master-prompt.md`, `dist/data/seed-registry.json` |
| CLI smoke (Node spawn in temp dir) | PASS — `init --yes`, `scan`, `list`, `match`, `export`, `log`, `feedback`, `doctor`, `--help`, `--version` exit 0; `add https://gitlab.com/a/b` exit 1 with `REPO_UNSUPPORTED_HOST` |
| Live `omniskill add anthropics/skills` | **Not executed** |
| ESLint | **Not available** |

Unit/integration areas covered: scanner, registry, matcher, security, skill-parser, installer, fetcher/sync fixtures, bundle, logger, config, init confirmation, CLI e2e.

Important gaps in coverage (still open): interrupted sync atomicity under kill -9; real rate-limit against GitHub; Cursor rule load behavior inside Cursor IDE; concurrent registry writers.

---

## Remaining blockers

1. No live GitHub smoke verification in this audit.
2. No macOS/Linux execution evidence.
3. Vitest transitive critical advisories (devDependency).
4. Seed skill bodies not cached until user syncs (documented limitation, not a silent lie).

None of these block local offline use of init/match/export after a source checkout build.

---

## What was / was not verified

**Verified with evidence**
- Empty-repo T0 state.
- TypeScript strict build.
- Automated tests (48).
- Real CLI execution paths for required commands on Windows temp projects.
- Package contents include runtime data assets.
- Unsupported host rejection for `add`.
- Init confirmation behavior after H-01 fix.

**Not verified**
- End-to-end live GitHub skill download from the seed repositories.
- Agent runtime obedience (Claude Code / Cursor actually loading instructions).
- npm registry publication.
- Non-Windows platforms.
- Security heuristic completeness against novel prompt-injection.

**Honesty note:** Passing Vitest does not prove production readiness against live GitHub or multi-OS packaging. This report separates those claims deliberately.
