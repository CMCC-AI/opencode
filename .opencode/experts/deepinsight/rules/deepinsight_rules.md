# DeepInsight Deep Research Team Rules

This expert package runs inside OpenCode/DeepInsight, not WorkBuddy.

## Runtime Contract

- The team lead is `deepinsight/deepinsight-team-lead`.
- The lead must orchestrate members with the `task` tool only.
- Every `task.subagent_type` must be one of the fully qualified member IDs from `expert.json`.
- Do not call external research MCP services as a substitute for team orchestration.
- Do not simulate member reports in the lead context. Member analysis must come from member subagents.
- Parallel phases should launch multiple `task` calls in the same assistant turn when the runtime supports it.
- Serial phases must wait for the previous phase's task results before continuing.

## Team Boundary

There is no separate team-creation tool. At the start of an analysis, the lead should state the team boundary in text, then dispatch member tasks.

## Data Access

- Members should use `websearch`/`webfetch` for external research.
- Local materials must be read with the Read tool; do not fabricate facts not present in source materials.
- All key facts, numbers, policies and viewpoints must have nearby `<cite>` citations.
- Missing data must be left blank or marked "材料未说明".

## Output Discipline

- **No** greetings: "好的", "收到", "作为XX专家", "我将综合", "下面是".
- **No** meta-narration: "我将采用SCQA逻辑", "本节将达到".
- Internal tracking IDs (`SRC-*`, `LF-*`, `REQ-*`, workspace paths, DAG node names) must never appear in final user-visible reports.
- Evidence status and delivery are separate: when evidence review fails, deliver complete artifacts with `delivered_with_evidence_gaps` marking; never claim "全部通过".

## Delivery Contract

Each member return must include:
1. Task understanding (what analysis task was received)
2. Tools used and key inputs
3. Generated/updated file names or content
4. Core conclusions (concise)
5. Data gaps (what dimensions of data are missing)
6. Acceptance status and remaining risks
