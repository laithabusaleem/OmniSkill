# QA-03 — Security Audit and Adversarial Skill Testing

**Role:** Application security review (defensive)  
**Date:** 2026-10-10  
**Scope:** OmniSkill CLI 0.1.0 source in this repository  
**Inputs:** `SECURITY.md`, `SPEC.md`, `docs/qa/QA-01-engineering-audit.md`, `docs/qa/QA-02-regression.md`, implementation under `src/`

**Not claimed:** External penetration test, bug bounty, SOC2/ISO certification, or formal third-party audit.

---

## Executive summary

OmniSkill’s primary risk is **ingesting untrusted third-party Markdown** (and related metadata) from GitHub into a developer workspace and surfacing it to AI coding agents. The application does **not** execute skill scripts and has **no LLM client** in the core path, which removes several classes of supply-chain RCE and “phone-home source code” risks—but **prompt injection against the agent remains residual** after any download.

This review confirmed one **High** hostname-allowlist bypass in redirect handling, plus several **Medium** hardening gaps (cache integrity, YAML dangerous keys, symlink install targets, traversal skill paths). Fixes and adversarial regressions were added. Heuristic phrase scanners remain **warnings only**, not security boundaries.

---

## Threat model (assessed)

| Threat | Exposure | Boundary / control |
|--------|----------|-------------------|
| Malicious GitHub repo | High (user-initiated `add`/`sync`) | Host allowlist, path validation, size/timeout, no script exec |
| Prompt injection in skills | High (agent reads text) | Trusted policy separation in bundles; heuristic warnings **only** |
| Path traversal | Medium | `assertSafeRelativePath` on discovery + fetch + resource resolve |
| Unsafe FS writes | Medium | Writes under `.omni/` / managed markers; symlink reject |
| Symlink abuse | Medium | `lstat` reject on cache/instruction destinations |
| Unexpected HTTP redirects | High | Exact/dot-boundary GitHub host allowlist (fixed) |
| Oversized/malformed responses | Medium | Max bytes + timeout; YAML key deny-list |
| YAML/JSON parsing | Medium | Custom YAML (no `eval`); Zod registry validation |
| Corrupted/tampered cache | Medium | SHA-256 meta verification on bundle load (fixed) |
| Secret leakage in logs | Medium | Redaction defaults expanded |
| Project source → external AI | Low (core) | No LLM API client; GitHub fetch only for skills |
| Dependency/supply chain | Medium | Minimal runtime deps (`commander`, `zod`); no package `install` scripts in app |
| Destructive user config overwrite | Medium | Marker-scoped install + backup |
| Misleading agent “native” claims | Low | Portable adapter `native: false` |
| Unsafe shell from skills | High (agent) | OmniSkill never runs them; warnings for script-like phrases |

---

## Adversarial fixtures

Located under `tests/fixtures/adversarial/` (harmless text only):

| # | Fixture | Purpose |
|---|---------|---------|
| 1 | `env-reveal/SKILL.md` | Ask agent to reveal env / secrets |
| 2 | `policy-override/SKILL.md` | Override OmniSkill trusted policy |
| 3 | `path-escape/SKILL.md` | Outside-directory / absolute links |
| 4 | (mock tree) | Path traversal in repo listing |
| 5 | (mock fetch) | Redirect to `prefixgithub.com` |
| 6 | `malformed-frontmatter/SKILL.md` + oversize mock | Unsafe YAML keys / oversized body |
| 7 | (runtime tamper) | Cache hash mismatch |
| 8 | (inline registry) | Duplicate IDs / missing sources |
| 9 | (temp project) | `.env`, `credentials.json`, `id_rsa` |
| 10 | `run-script/SKILL.md` | Request to run included script |

Automated coverage: `tests/unit/security-adversarial.test.ts`.

---

## Findings

### S-01 — Redirect host allowlist bypass via `endsWith("github.com")` (High) — **FIXED**

- **Evidence:** `"prefixgithub.com".endsWith("github.com") === true`. Pre-fix `fetcher.ts` accepted such final URLs after redirect.
- **Impact:** A malicious redirect could deliver skill content from an attacker-controlled host that merely *suffix-matches* `github.com` / `githubusercontent.com`.
- **Remediation:** `isTrustedGitHubHost()` exact set + `.githubusercontent.com` **dot-boundary** only (`src/core/security.ts`, `fetcher.ts`).
- **Regression:** adversarial test #5; `tests/unit/security.test.ts` host allowlist cases.
- **Residual:** Compromised legitimate GitHub infrastructure is out of scope.

### S-02 — Traversal `SKILL.md` paths still discoverable/fetchable (Medium) — **FIXED**

- **Evidence:** Tree entries like `../escape/SKILL.md` previously matched discovery filters.
- **Remediation:** `discoverSkillPaths` drops unsafe paths; `fetchFileRaw` requires `assertSafeRelativePath`.
- **Regression:** adversarial test #4; acquisition-edge “drops path-traversal”.

### S-03 — Cache tampering not detected on bundle load (Medium) — **FIXED**

- **Evidence:** `readCachedSkill` returned file bytes without comparing `meta.json` hash.
- **Remediation:** `readCachedSkillVerified()`; bundle builder refuses hash mismatches.
- **Regression:** adversarial test #7.
- **Residual:** Missing `meta.json` still loads content (with `no-meta` reason) for backward compatibility with older caches.

### S-04 — Dangerous YAML keys in frontmatter (Medium) — **FIXED**

- **Evidence:** Parser assigned arbitrary keys including `__proto__`.
- **Remediation:** `assertSafeYamlKey` rejects `__proto__` / `constructor` / `prototype`; OmniErrors not wrapped away.
- **Regression:** adversarial test #6 (`YAML_UNSAFE_KEY`).

### S-05 — Instruction install through symlink (Medium) — **FIXED**

- **Evidence:** `installManagedInstructions` would follow/write via symlink to an attacker-chosen target if the user (or malware) planted `CLAUDE.md` as a link.
- **Remediation:** `assertNotSymlink` before read/write.
- **Regression:** adversarial symlink test (skipped only if OS cannot create symlinks).

### S-06 — Prompt-injection / script / env phrases only heuristically flagged (Medium residual) — **DOCUMENTED**

- **Evidence:** `scanSuspiciousInstructions` matches known phrases; creative wording bypasses it.
- **Remediation:** Expanded patterns (env reveal, policy override, script run, `chmod +x`); `SECURITY.md` states heuristics are **not** a boundary.
- **Regression:** fixtures 1, 2, 10 assert warnings fire for those samples.
- **Residual:** **Cannot claim prevention of all prompt injection.** Agent obedience is outside OmniSkill’s process boundary.

### S-07 — Secret-like files could enter scan listings (Low) — **HARDENED**

- **Evidence:** Only `.env*` was skipped previously.
- **Remediation:** `isLikelySecretFileName` also skips `credentials.json`, key material patterns, etc.
- **Regression:** adversarial test #9.
- **Residual:** Arbitrary filenames with secrets still possible; scanner never sends content off-host.

### S-08 — Log redaction incomplete for some token shapes (Low) — **HARDENED**

- **Remediation:** Broader redaction (`Bearer`, `sk-`, `AKIA…`, authorization fields).
- **Regression:** adversarial log redaction test.
- **Residual:** Novel secret formats may still appear if `privacy.logRawTask` is enabled by the user.

### S-09 — Dependency / package scripts (Informational)

- **Evidence:** Runtime deps only `commander` and `zod`. App `package.json` has no malicious install scripts; Vitest/esbuild postinstall exists in **devDependencies** (contributor machine risk).
- **npm audit** previously reported Vitest-tree advisories (dev). Not force-upgraded in this pass.
- **Residual:** Keep deps minimal; re-audit before publish.

### S-10 — No automatic execution of downloaded skills (Positive control)

- **Evidence:** Grep of `src/` shows no `child_process` / `eval` / `vm` usage for skills. Adversarial `add` of `run-script` fixture caches Markdown only; no `install.sh` created/executed.
- **Status:** Confirmed by code inspection + test #10.

### S-11 — No project source transmission to AI APIs (Positive control)

- **Evidence:** Core has no LLM HTTP client. Adversarial test asserts mocked fetch URLs are GitHub-only and do not include local source filenames.
- **Residual:** If a future optional LLM matcher is added, it must remain opt-in and must not upload repo contents by default.

---

## Implementation review checklist

| Control | Status | How verified |
|---------|--------|--------------|
| Repo URL/path validation | Pass | Unit + adversarial tests |
| Timeouts + size limits | Pass | Fetcher tests / oversize case |
| Redirect host allowlist | Pass (after S-01) | Adversarial #5 |
| Writes stay in intended dirs | Pass | Path + cache root checks |
| Preserve/backup user files | Pass | Installer tests (prior QA-02) |
| No auto script execution | Pass | Code grep + fixture #10 |
| Logs secret-safe by default | Pass | Redaction tests |
| No project source → AI | Pass | Architecture + fetch URL test |
| Untrusted skills cannot rewrite trusted policy files | Pass | Bundle policy ordering; installer only touches managed markers |
| Registry/cache recoverable | Pass | Atomic write + tmp leftover tests (QA-02); hash refuse on tamper |
| Package scripts appropriate | Pass (runtime) | Manual `package.json` review |

---

## Fixes applied in this review

1. `isTrustedGitHubHost` + fetcher redirect checks  
2. Safe skill path discovery/fetch  
3. Cache integrity verification for bundles  
4. YAML dangerous key rejection  
5. Symlink rejection for installs/cache  
6. Expanded suspicious-instruction heuristics + secret filename skip + log redaction  
7. `SECURITY.md` updated to distinguish boundaries vs warnings  

---

## Tests actually executed

| Command | Result |
|---------|--------|
| `npm run build` | **PASS** |
| `npm test` | **PASS — 125 passed, 1 skipped** (live GitHub opt-in) |
| Adversarial suite | `tests/unit/security-adversarial.test.ts` — **15 passed** |
| Live GitHub / external pentest | **Not performed** |
| Attacking public services | **Not performed** (mocks + local fixtures only) |

---

## Residual risk statement

Even with the above controls, **any agent that reads untrusted skill Markdown can still be socially engineered** by instructions that evade phrase heuristics. OmniSkill’s enforceable guarantees stop at: no local execution of skill code, constrained network hosts/paths, integrity-aware cache use, marker-scoped installs, and clear labeling of untrusted content. Users must review skills and agent behavior; detection of suspicious phrases is an aid, not a guarantee.
