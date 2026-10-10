# Workflow templates

Templates live in `src/core/workflow-planner.ts` and are selected from task classification. Users can extend by adding templates in-tree (future: external JSON providers via `WorkflowTemplateProvider`).

## Built-in templates

| ID | Domains | Notes |
|----|---------|-------|
| `business-launch` | business, research, social | Approval before publish/spend |
| `novel-writing` | writing | Continuity + publish gate |
| `social-reel` | social, business, writing | Media stages; render only with ffmpeg + `--media` |
| `software-feature` | software | Verify vs invent results |
| `generic-delivery` | general | Fallback |

## Execution

```bash
omniskill plan "…"          # write plan under .omni/plans
omniskill run "…"           # execute stages (may pause for --approve)
omniskill run --job <id>    # inspect checkpoint
omniskill artifacts
```

`run` always distinguishes **document/planning artifacts** from **verified media**.
