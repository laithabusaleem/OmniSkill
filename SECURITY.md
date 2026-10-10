# Security Policy

## Trust model

OmniSkill downloads third-party Markdown instructions into a developer project. Those instructions may contain prompt-injection text even when they contain no executable code.

| Layer | Trust |
|-------|--------|
| OmniSkill security policy / master prompt | Trusted product policy |
| User-authored files outside managed markers | Trusted user content (preserved) |
| Seed registry metadata | Untrusted until reviewed |
| Downloaded `SKILL.md` bodies | Untrusted third-party guidance |
| Local imported skills | Untrusted until reviewed (`approve`) |
| Project context (opt-in) | User-controlled; distinguish user_fact / external_evidence / ai_assumption |
| Optional LLM features | Disabled unless explicitly configured (not shipped in core classifier) |

## Security boundaries (enforced in code)

- Validate GitHub repository identifiers; reject non-`github.com` HTTPS hosts.
- Follow HTTP redirects only to an **exact / dot-boundary** allowlist of GitHub hosts (not naive `endsWith("github.com")`).
- Enforce request timeouts and response size limits.
- Reject skill paths with traversal (`..`), absolute paths, or empty segments before fetch/write.
- Keep cache writes under `.omni/skills/<sanitized-id>/`; reject symlink destinations.
- Verify cached skill content against recorded SHA-256 when `meta.json` is present; refuse mismatched content in bundles.
- Refuse dangerous YAML frontmatter keys (`__proto__`, `constructor`, `prototype`).
- Install agent instructions only inside identifiable managed markers (or a dedicated OmniSkill rule file), with backups.
- Never `eval` skill content or execute skill repository scripts.
- Never treat a skill as supplying a missing host capability (video, publish, image gen, etc.).
- Require explicit approval before publish/spend paths in workflow plans (`requiresApproval`).
- Workflow `run` does not execute downloaded skill bodies as code; media adapters require explicit permissions and verify outputs before `verified`.
- Capability registry provenance.verified is false until a real probe/check succeeds.
- Redact common secret patterns from logs by default.
- Do not transmit project source files to external AI APIs (core workflow has no LLM client).
- Refuse to silently replace an invalid registry with defaults.
- Skip likely secret filenames during project scanning (`.env*`, `credentials.json`, keys, etc.).

## Warning-only detectors (not a boundary)

`scanSuspiciousInstructions()` flags phrases such as prompt-injection, env disclosure, and script-run requests.

**These heuristics do not prevent prompt injection.** A creative instruction can bypass phrase matching. The real boundaries are: no code execution, path/host allowlists, integrity checks, and clear separation of trusted OmniSkill policy from untrusted skill bodies in bundles.

## What OmniSkill does not guarantee

- Heuristic scanning cannot prove a skill is safe.
- A selected skill is not proof it was loaded by an agent.
- Network or GitHub availability.
- License compatibility for redistribution of third-party skills.
- That an agent will obey OmniSkill policy after reading untrusted skill text.

## Reporting issues

Report security issues privately via [GitHub Security Advisories](https://github.com/laithabusaleem/OmniSkill/security/advisories/new)
for this repository when available, or contact the maintainer (@laithabusaleem) privately.

Do not file public issues that include secrets or exploit chains against third-party skill hosts.
