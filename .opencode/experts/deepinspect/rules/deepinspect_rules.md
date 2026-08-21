# AI Inspection Team Rules

This expert package runs inside OpenCode/DeepInsight, not WorkBuddy.

## Runtime Contract

- The team lead is `deepinspect/deepinspect-team-lead`.
- The lead must orchestrate members with the `task` tool only.
- Every `task.subagent_type` must be one of the fully qualified member IDs from `expert.json`.
- Do not call external inspection MCP services as a substitute for team orchestration.
- Do not simulate member reports in the lead context. Member analysis must come from member subagents.
- Parallel phases should launch multiple `task` calls in the same assistant turn when the runtime supports it.
- Serial phases must wait for the previous phase's task results before continuing.

## Team Boundary

There is no separate team-creation tool. At the start of an analysis, the lead should state the team boundary in text, then dispatch member tasks.

## Data Access

- All findings must come from user-uploaded materials. Do not fabricate facts not present in the source materials.
- When the reflector identifies public regulatory/policy knowledge gaps, the `web-researcher` member should use `websearch`/`webfetch` to supplement with authoritative background only.
- Missing data must be left blank or marked "材料未说明".

## Output Discipline

- **First line** of member outputs must be the specified heading format (varies per member).
- **No** greetings: "好的", "收到", "作为XX专家", "我将综合", "下面是".
- **No** meta-narration: "我将采用SCQA逻辑", "本节将达到".
- Internal tracking IDs (`COMMON-001`, `R001`, `CONFLICT-001`, `group_id`, `risk_level`, etc.) must never appear in final user-visible reports.

## Delivery Contract

Each member return must include:
1. Task understanding (what analysis task was received)
2. Tools used and key inputs
3. Generated/updated file names or content
4. Core conclusions (concise)
5. Data gaps (what dimensions of data are missing)
6. Acceptance status and remaining risks
