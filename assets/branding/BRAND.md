# OmniSkill brand

## Positioning

OmniSkill is an open-source, project-aware AI **skill router** for developers. The identity should feel technical, precise, and calm—not futuristic AI theater.

## Mark

The mark is a central node with four orthogonal links to modular blocks. It reads as routing / composition of skills, remains legible at 16–32px (GitHub avatar / favicon scale), and uses hard geometry rather than illustration.

Files:

- `omniskill-mark.svg` — icon / avatar
- `omniskill-logo.svg` — mark + wordmark for README headers

## Palette

| Token | Hex | Use |
|-------|-----|-----|
| Ink | `#0F1419` | Dark surfaces, wordmark on light |
| Mist | `#E8EEF2` | Module fills on dark mark |
| Signal | `#3DDC97` | Accent / routing lines |
| Paper | `#F4F6F8` | Optional light page background |

Signal green is for structure, not neon glow. Avoid purple AI gradients and metallic chrome.

## Typography

Wordmark uses a clean UI sans (system stack in SVG). In documentation, prefer the repository’s existing monospace for commands; do not introduce display fonts into the CLI.

## Voice

- Short, factual, developer-facing
- No hype (“revolutionary”, “magical”)
- Distinguish OmniSkill-authored policy, third-party skills, and user files

## CLI

Branding in the terminal is a single help/init identity line. No ASCII banners on every command. Respect `NO_COLOR` and `--json`.

## Attribution

Generated bundles may include an optional footer. Never invent a GitHub URL. Never watermark downloaded third-party `SKILL.md` files or user source by default.
