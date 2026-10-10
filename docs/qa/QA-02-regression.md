# QA-02 — Functional, Regression, and Edge-Case Testing

**Date:** 2026-10-10  
**Environment:** Windows 10 · Node v24.21.0 · Vitest 3.2.7 · `@vitest/coverage-v8` 3.2.7  
**Inputs:** `SPEC.md`, `docs/qa/QA-01-engineering-audit.md`

---

## Test strategy

| Principle | Application |
|-----------|-------------|
| Behavior over coverage % | Assertions target exit codes, filesystem effects, scoring order, error codes, and preserved user content |
| Isolation | `tests/helpers/temp.ts` creates unique temp directories; no writes into the real user project |
| Network | Routine suite mocks `fetch`; live GitHub is opt-in only |
| Determinism | Matcher tie-breaks by skill id; no wall-clock sleeps except abort/timeout fixtures |
| Independence | Each test builds its own fixture; no shared mutable global registry |

### Suite layout

| Area | Primary files |
|------|----------------|
| CLI matrix | `tests/integration/cli-matrix.test.ts`, `tests/integration/cli.test.ts` |
| Command runners (direct) | `tests/unit/commands-direct.test.ts` |
| Scanner | `tests/unit/scanner.test.ts`, `tests/unit/scanner-edge.test.ts` |
| Registry | `tests/unit/registry.test.ts`, `tests/unit/registry-integrity.test.ts` |
| Matching | `tests/unit/matcher.test.ts`, `tests/unit/matcher-quality.test.ts` |
| Acquisition | `tests/unit/fetcher.test.ts`, `tests/unit/acquisition-edge.test.ts` |
| Installer | `tests/unit/installer.test.ts`, `tests/unit/installer-edge.test.ts` |
| Bundles | `tests/unit/bundle-logger.test.ts`, `tests/unit/bundle-edge.test.ts` |
| Logging / feedback | `tests/unit/logging-feedback.test.ts` |
| Doctor | `tests/unit/doctor-edge.test.ts` |
| Live GitHub (opt-in) | `tests/integration/github-live.test.ts` |

### Opt-in live GitHub

```bash
OMNISKILL_LIVE_GITHUB=1 npm run test:live-github
```

Uses public repos only. Optional `GITHUB_TOKEN` for rate limits. **Skipped by default** (`describe.skipIf`).

### Coverage policy

- Tooling: `npm run test:coverage` (V8 provider).
- Thresholds (justified for core business logic): statements/lines/functions ≥ 70%, branches ≥ 60%.
- `src/cli.ts` excluded from coverage totals (thin Commander wiring covered via process spawns).
- Do not chase 100% at the expense of weak assertions.

---

## Coverage results (measured)

Command: `npm run test:coverage`

| Metric | Overall | Threshold | Status |
|--------|---------|-----------|--------|
| Statements | **83.57%** | 70% | PASS |
| Branches | **76.13%** | 60% | PASS |
| Functions | **90.26%** | 70% | PASS |
| Lines | **83.57%** | 70% | PASS |

Notable module coverage (lines):

| Module | Lines (approx.) |
|--------|-----------------|
| `core/installer.ts` | 100% |
| `core/matcher.ts` | ~96% |
| `core/registry.ts` | ~97% |
| `core/fetcher.ts` | ~95% |
| `core/sync.ts` | ~95% |
| `core/scanner.ts` | ~89% |
| `core/agent-adapters.ts` | ~38% (cursor/portable install paths less exercised than Claude) |
| `commands/*` | ~76% aggregate after direct runner tests |

HTML report: `coverage/index.html` (gitignored).

---

## Failures discovered and fixes

### R-01 — Scanner exceeded `maxFiles` cap (High)
- **Symptom:** With 450 root files + `package.json`, `profile.metadata.fileSampleCount` was **451** despite `maxFiles = 400`.
- **Cause:** Cap checked only on the outer `while`, not inside the per-directory `for` loop.
- **Fix:** Break the inner loop when `out.length >= maxFiles` in `src/core/scanner.ts`.
- **Regression:** `tests/unit/scanner-edge.test.ts` → “caps large directory trees”.

### R-02 — Invalid `--agent` accepted via cast (Medium)
- **Symptom:** CLI cast strings to `AgentKind` without validation (QA-01 L-01).
- **Fix:** `parseAgentKind()` in `src/core/agent-adapters.ts`; used by `init` / `export` in `src/cli.ts`.
- **Regression:** `tests/integration/cli-matrix.test.ts` → “rejects invalid agent on init”.

### R-03 — No installer rollback helper (Medium)
- **Symptom:** Backups existed but SPEC-oriented rollback was not callable.
- **Fix:** `rollbackFromBackup()` in `src/core/installer.ts`.
- **Regression:** `tests/unit/installer-edge.test.ts` backup + rollback cases.

---

## Final test / build results

| Command | Result |
|---------|--------|
| `npm run build` | **PASS** |
| `npm test` | **PASS — 109 passed, 1 skipped** (22 files: 21 passed, 1 skipped) |
| `npm run test:coverage` | **PASS** (thresholds met) |
| `OMNISKILL_LIVE_GITHUB=1` live test | **Not run** in this session (remains opt-in) |

Skipped test: `tests/integration/github-live.test.ts` (requires `OMNISKILL_LIVE_GITHUB=1`).

---

## Behavioral coverage checklist

| Requirement area | Covered? | Notes |
|------------------|----------|-------|
| Every CLI command + help/version | Yes | `cli-matrix` + `cli` integration |
| JSON mode + exit codes | Yes | Corrupt registry doctor → exit 1; invalid add → nonzero |
| Invalid input | Yes | Bad repo, bad agent, missing source, uninit scan |
| Empty / malformed / monorepo / mixed lang scan | Yes | scanner + scanner-edge |
| Large trees / excluded dirs / symlink (best-effort) | Yes | Symlink skipped if OS denies |
| Unreadable dirs | Partial | chmod on non-Windows; Windows still must not throw |
| Registry malformed / dup / migration / tmp leftovers | Yes | registry-integrity |
| Matcher signals + disabled/quarantine/threshold/ties | Yes | matcher-quality |
| Acquisition 404/rate/timeout/oversize/redirect/cache | Yes | fetcher + acquisition-edge |
| Offline after cache | Yes | cached read without network |
| Install / repeat / markers / backup / rollback / dry-run | Yes | installer-edge |
| Bundle size / dedupe / attribution / unsafe paths | Yes | bundle-edge |
| Log corrupt/empty/privacy/feedback stats | Yes | logging-feedback |
| Live GitHub | Opt-in only | Not executed this run |

---

## Remaining gaps

1. **True concurrent** multi-process installer races not simulated (sequential last-writer-wins covered).
2. **Windows ACL-unreadable files** not fully simulated (chmod model is POSIX).
3. **Live GitHub** smoke not executed in CI/default suite.
4. **`agent-adapters` cursor/portable** branches still thinner than Claude Code path.
5. **Property-based testing** not added — would need `fast-check` (extra dependency); current deterministic fixtures judged sufficient for 0.1.0.
6. **Interrupted rename mid-flight** (kill -9 between tmp write and rename) not instrumented beyond leftover `.tmp` coexistence.

---

## Commands for contributors

```bash
npm run build
npm test
npm run test:coverage
OMNISKILL_LIVE_GITHUB=1 npm run test:live-github   # optional
```
