# QA-04 — Cross-Platform and Agent Compatibility

**Role:** Compatibility engineer  
**Date:** 2026-10-10  
**Inputs:** `SPEC.md`, `README.md`, QA-01…QA-03 reports, Cursor Rules docs, Claude Code `CLAUDE.md` docs  

---

## Environments actually exercised

| Environment | How verified | Status |
|-------------|--------------|--------|
| **Windows 10/11** (NT 10.0.26200) + **PowerShell 5.1** + Node 24 | Local shell: full `npm test`, spaced-path `init --agent cursor`, CLI exit codes | **Tested** |
| **macOS** | Not available on this workstation (no macOS host). CI job defined in `.github/workflows/ci.yml` (`macos-latest`) | **Not tested here** — pending GitHub Actions run |
| **Linux** | WSL and Docker **not installed** on this machine. CI job defined (`ubuntu-latest`) | **Not tested here** — pending GitHub Actions run |

Do **not** treat code review alone as macOS/Linux verification.

CI matrix (when the repo is pushed to GitHub and Actions run):

- OS: `ubuntu-latest`, `windows-latest`, `macos-latest`
- Node: 20, 22
- Steps: `npm ci`, build, typecheck, test, coverage (Node 22), `npm pack --dry-run`

At the time of this report the workspace had **no git remote**, so Actions have **not** been executed yet.

---

## Platform findings and fixes

| ID | Issue | Severity | Remediation |
|----|-------|----------|-------------|
| P-01 | Cursor `.mdc` was previously written via HTML marker wrapping, placing comments **before** YAML `---` and breaking documented Cursor frontmatter rules | High (compat) | Dedicated file install (`installDedicatedManagedFile`); `assertCursorRuleFormat`; empty `globs:` removed; `alwaysApply: true` kept |
| P-02 | Marker/file writes used non-atomic `writeFileSync` | Medium | Switched instruction installs / rollback to `atomicWriteText` |
| P-03 | Capability claims overstated “skill installation” for agents | Medium (honesty) | Explicit `capabilities[]` matrix: skill discovery/install **unsupported** for all adapters; bundles require manual attach |

Platform-sensitive automated coverage: `tests/unit/platform-compat.test.ts` (paths with spaces/Unicode, CRLF preservation, atomic replace, POSIX chmod best-effort, CLI shebang/exit codes, adapter formats).

---

## Agent capability matrix

**Verification methods legend**

- `format` — generated file matches documented on-disk format  
- `unit` — automated Vitest  
- `windows-smoke` — executed on this Windows host  
- `docs` — compared to vendor documentation (Cursor Rules / Claude Code CLAUDE.md)  
- `not-demo` — agent runtime auto-load of bundles **not** demonstrated  

| Agent | Platform | Capability | Verification method | Status | Known limitations |
|-------|----------|------------|---------------------|--------|-------------------|
| Claude Code | Windows | Project instructions (`CLAUDE.md` managed markers) | format + unit + windows-smoke | **Supported** | User content outside markers preserved; reload agent if cached |
| Claude Code | Windows | Skill discovery | docs + code | **Unsupported** | Skills live in `.omni/`; not registered as `.claude/skills/` |
| Claude Code | Windows | Skill installation (native agent skills) | docs + code | **Unsupported** | Pointers only; no auto skill install into Claude Code |
| Claude Code | Windows | Task-specific bundle export | unit + windows-smoke | **Supported** | Via `omniskill export`; **not** auto-loaded by Claude Code (`not-demo`) |
| Claude Code | Windows | Verification workflow | format | **Partial** | Instruction text only; OmniSkill does not run the agent |
| Claude Code | Windows | Cleanup / rollback | unit | **Supported** | `.omni/backups/` + `rollbackFromBackup` |
| Claude Code | macOS / Linux | (same capabilities) | CI pending | **Untested here** | Same code paths; await Actions |
| Cursor | Windows | Project instructions (`.cursor/rules/omniskill.mdc`) | format + unit + docs + windows-smoke | **Supported** | File must start with YAML frontmatter; whole file OmniSkill-owned |
| Cursor | Windows | Skill discovery | docs + code | **Unsupported** | Rules ≠ skill registry |
| Cursor | Windows | Skill installation | docs + code | **Unsupported** | No Cursor skill directory install |
| Cursor | Windows | Task-specific bundle export | unit | **Supported** | Manual attach; **not** auto-discovered (`not-demo`) |
| Cursor | Windows | Verification workflow | format | **Partial** | Instruction text only |
| Cursor | Windows | Cleanup / rollback | unit | **Supported** | Backup before overwrite of dedicated `.mdc` |
| Cursor | macOS / Linux | (same capabilities) | CI pending | **Untested here** | Await Actions |
| Portable Markdown | Windows | Project instructions (native) | code | **Unsupported** | Explicitly non-native |
| Portable Markdown | Windows | Task-specific bundle / portable export | unit + windows-smoke | **Supported** | User must attach file in their agent |
| Portable Markdown | Windows | Skill discovery / installation | code | **Unsupported** | N/A |
| Portable Markdown | Windows | Verification / rollback | format + unit | **Partial / Supported** | Workflow text + file backups |

---

## Documented integration mechanisms (reviewed)

### Claude Code
- **Documented:** Project `CLAUDE.md` (or `.claude/CLAUDE.md`) loaded as project memory ([Claude Code docs](https://code.claude.com/docs/en/claude-md)).
- **OmniSkill implements:** Root `CLAUDE.md` with HTML comment managed block (safe for plain Markdown).
- **Not implemented / not claimed:** Writing `.claude/skills/*/SKILL.md`, hooks, or proving session auto-load of `.omni/bundles/*`.

### Cursor
- **Documented:** `.cursor/rules/*.mdc` with YAML frontmatter (`description`, `globs`, `alwaysApply`) ([Cursor Rules docs](https://cursor.com/docs/rules)).
- **OmniSkill implements:** Dedicated `omniskill.mdc` with `alwaysApply: true`, frontmatter-first.
- **Not claimed:** Auto-discovery of export bundles; folder-based `RULE.md` layout (legacy `.mdc` still widely used).

---

## Package installation and invocation (Windows)

| Check | Result |
|-------|--------|
| `npm run build` | PASS |
| `node dist/cli.js --help` | PASS (exit 0) |
| Shebang `#!/usr/bin/env node` in `dist/cli.js` | Present (npm generates `.cmd` shims on Windows when linked) |
| `npm pack --dry-run` | PASS (includes `dist/data` assets) |
| Init in directory with spaces (`Omni QA Space …`) | PASS; Cursor `.mdc` frontmatter-ok |

---

## Automated tests added

- `tests/unit/platform-compat.test.ts` — platform + agent format/capability honesty  
- `.github/workflows/ci.yml` — multi-OS CI definition  

Full suite on this host after fixes:

```
npm run build  → PASS
npm test       → 138 passed, 1 skipped (live GitHub opt-in)
```

---

## Residual gaps

1. macOS and Linux **not executed** on this workstation; rely on future GitHub Actions runs.  
2. Agent **runtime** behavior (Claude Code / Cursor actually loading rules in a live session) was **not** demoed—only on-disk formats and docs alignment.  
3. Concurrent multi-process file locking under heavy load not stress-tested (sequential atomic replace covered).  
4. npm global `omniskill` link shim not exercised beyond `node dist/cli.js` (Windows `.cmd` generation is npm’s responsibility when `npm link` is used).
