# Third-party code and skill sources

## Runtime dependencies (bundled via npm)

| Package | Role | License (as declared by package) |
|---------|------|----------------------------------|
| [commander](https://www.npmjs.com/package/commander) | CLI parsing | MIT |
| [zod](https://www.npmjs.com/package/zod) | Schema validation | MIT |

DevDependencies (TypeScript, Vitest, coverage tooling, `@types/node`) are not required at runtime. Their licenses apply to the development toolchain; see each package’s `LICENSE` under `node_modules/` after `npm install`.

OmniSkill does **not** vendor copies of these libraries into `src/`. No separate `NOTICE` file is required solely for these MIT dependencies under typical MIT redistribution of this repository’s own source.

## Brand assets

SVG mark/logo under `assets/branding/` are original OmniSkill product assets in this tree (not third-party stock). Treat them under the same project license as the rest of the repository once the owner confirms licensing.

## Seed registry vs downloaded skills

`src/data/seed-registry.json` contains **metadata only** (names, triggers, GitHub source URLs). It does **not** embed full upstream `SKILL.md` bodies.

Seed discovery URLs currently referenced (unreviewed; not redistributed here):

- https://github.com/anthropics/skills
- https://github.com/travisvn/awesome-claude-skills
- https://github.com/ComposioHQ/awesome-claude-skills
- https://github.com/obra/superpowers

When a user runs `add` / `sync`, OmniSkill may download third-party Markdown into that user’s local `.omni/skills/` cache. Those files remain **third-party content** subject to each upstream repository’s license and terms. OmniSkill:

- Does not claim ownership of those instructions
- Does not publish downloaded skill bodies as part of the OmniSkill npm package
- Does not guarantee license compatibility for redistributing cached skills

Before redistributing any cached skill content outside a private project, review the upstream license yourself.

## Test fixtures

`tests/fixtures/adversarial/*` contains synthetic hostile Markdown for security tests. These are original test materials, not copies of upstream skills.
