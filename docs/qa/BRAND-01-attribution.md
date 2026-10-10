# BRAND-01 — Identity and attribution

## Scope

Open-source visual identity, CLI identity line, configurable attribution for generated artifacts, provenance in bundles, documentation, and regression tests.

## Assets verified

| Asset | Path | Checks |
|-------|------|--------|
| Mark SVG | `assets/branding/omniskill-mark.svg` | Valid SVG, `<title>`, geometric mark |
| Logo SVG | `assets/branding/omniskill-logo.svg` | Valid SVG, wordmark “OmniSkill” |
| Brand notes | `assets/branding/BRAND.md` | Palette, voice, attribution rules |
| README | `README.md` | Branding and attribution section |

## Behaviors verified (automated)

| Behavior | Test / command |
|----------|----------------|
| No invented repository URL | `tests/unit/branding.test.ts` |
| Configured URL in footer | same |
| Custom `footerText` / disabled attribution | same |
| Bundle provenance + default footer | same |
| `--no-attribution` omits footer (API + CLI) | same |
| Cached third-party `SKILL.md` unchanged after export | same |
| User `CLAUDE.md` content preserved outside managed block | same |
| Help shows identity; `--json` init has no banners | same |
| `NO_COLOR` disables ANSI in identity helper | same |
| Attribution settings round-trip in `config.json` | same |
| Brand files present | same |

## Manual / build verification

Recorded 2026-10-10 on Windows (Node 20+):

```bash
npm run build   # ok — tsc + copy-assets
npm test        # 149 passed, 1 skipped (live GitHub)
```

Including `tests/unit/branding.test.ts` (11 cases). CLI help header uses `cliIdentityLine` (single line). Bundle footers and managed comments resolve URL from config → `OMNISKILL_REPO_URL` → `package.json` only when a valid `https:` URL exists.

## Explicit non-goals (confirmed)

- No watermarking of downloaded third-party skill files
- No branding inserted into user source by default
- No hidden tracking / telemetry identifiers
- No invented GitHub OWNER/REPO links
- No heavyweight runtime dependency for CLI branding
