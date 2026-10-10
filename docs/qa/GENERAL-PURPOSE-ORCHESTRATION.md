# General-purpose skill discovery and workflow orchestration

**Date:** 2026-10-10  
**Version:** OmniSkill `0.1.0` (expanded)  
**Status:** Implemented capabilities verified by automated tests in this workspace; not a claim of media rendering or live market data.

## Implemented capabilities

| Area | Status | Notes |
|------|--------|-------|
| Multi-domain task classification | **Implemented** | Deterministic rules in `src/core/classifier.ts` |
| Skill discovery (GitHub) | **Existing** | `add` / `sync` unchanged |
| Local skill directories | **Implemented** | `discover --local` / `discovery.localSkillDirs` |
| Skill evaluation heuristics | **Implemented** | `src/core/skill-evaluator.ts` via `discover` |
| Workflow planner + templates | **Implemented** | business / novel / reel / software / generic |
| Capability registry | **Implemented** | `capabilities` command |
| Opt-in project context | **Implemented** | `.omni/context.json` |
| Approve / reject / quarantine | **Implemented** | `approve` command |
| Model-assisted classification | **Not implemented** | Intentionally local/deterministic only |

## Tested workflows (automated)

- Multi-domain classification (business reel + Arabic language signal)
- Novel / software classification determinism
- Business vs UI skill matching; repository-index not auto-selected
- Video capability unavailable → reel plan without claiming MP4 export
- Business plan approval gates
- Context enable / protect user_fact / delete / project isolation
- Local SKILL.md import + evaluation excerpts
- Suspicious cached instructions → review/warnings
- Backward-compatible config defaults for older `.omni/config.json`

Commands covered in CLI help matrix: `classify`, `discover`, `plan`, `context`, `capabilities`, `approve`.

## Known limitations

- Classifier is heuristic — not LLM “understanding.”
- Seed multi-domain skills are **metadata placeholders**; real instruction bodies require local files or GitHub sync.
- No built-in image/audio/video generation, live web browsing, or social publishing.
- `web_research` status reflects GitHub/offline heuristics, not a general search API.
- Workflow templates are starting points, not mandatory processes.
- Evaluation scores are **not** proof of safety or license compliance.
- Existing project registries created before this expansion are not auto-migrated to new seed skills (re-init on a fresh project or merge manually).

## Supported skill sources

1. Public GitHub repositories containing `SKILL.md` (`add` / `sync`)
2. Local project directories (`discovery.localSkillDirs` or `discover --local` defaults)
3. Seed catalog metadata (`omniskill__seed-catalog` local source + prior GitHub seed pointers)

A README keyword hit is never treated as compatibility proof.

## Required external tools (host)

| Need | OmniSkill provides | External tool required |
|------|--------------------|------------------------|
| Finished video file | Storyboard/script/plan | Video editor / generator |
| Generated images | Brand/guideline text | Image tool + authorization |
| Live market numbers | Research checklist | Verified sources / user evidence |
| Published social post | Plan + approval gate | User-authorized publisher |
| Binary pptx/pdf | Markdown/JSON plans | User export toolchain |

## Security and licensing

- Downloaded and local skills remain untrusted; never executed by OmniSkill.
- `allowUnreviewedAutoSelect` can force manual `approve` before selection.
- License hints warn only; they are not legal clearance to redistribute.
- Context storage is opt-in; do not store unnecessary personal data.
- Publishing / spending stages set `requiresApproval`.

## Configuration example

```json
{
  "discovery": {
    "localSkillDirs": ["skills", ".agents/skills"],
    "allowUnreviewedAutoSelect": true
  },
  "context": { "enabled": false },
  "orchestration": { "autoClassifyOnMatch": true }
}
```

## Remaining work

- Optional model-assisted classification behind an explicit flag
- Richer license detection from upstream repo LICENSE files
- Registry merge command to pull new seed catalog entries into existing projects
- Deeper agent-native capability probing (beyond env flags)
- End-to-end human demos for novel/reel/business on real content projects

## Verification record

Recorded in the expansion session (Windows, Node 24):

```text
npm run build   # pass
npm test        # 161 passed, 1 skipped (live GitHub)
```

Includes `tests/unit/orchestration.test.ts` (12) and updated CLI help matrix for new commands.
