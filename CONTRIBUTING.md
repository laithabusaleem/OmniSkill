# Contributing

Thanks for helping improve OmniSkill. By participating you agree to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Setup

```bash
npm install
npm run build
npm test
npm run typecheck
```

Requires **Node.js 20+** (CI also exercises Node 22).

## Workflow

1. Discuss larger changes in an issue when practical.
2. Keep changes focused; prefer small modules under `src/core` and thin wrappers under `src/commands`.
3. Add or update tests for behavior changes.
4. Run `npm run build` and `npm test` before opening a PR.
5. Use the pull-request template; note anything unverified (live GitHub, other OS).

## Guidelines

- Prefer deterministic core paths; do not add paid API dependencies to default flows.
- Treat third-party skill content as untrusted guidance.
- Do not commit `.omni/`, secrets, coverage output, or `*.tgz` packs.
- Document any new dependency and why it is required.
- Do not invent repository URLs, stars, or unverified integration claims in docs.

## Licensing

Contributions are expected under the same license as the repository (`LICENSE`).
Confirm with maintainers if you need to bring in code under a different license.

## Security reports

See [SECURITY.md](./SECURITY.md). Do not open public issues that include secrets or
exploit chains against third-party hosts.
