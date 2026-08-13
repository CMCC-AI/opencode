# DeepTrading A-Share Research Team Rules

This expert package runs inside OpenCode/DeepInsight, not WorkBuddy.

## Runtime Contract

- The team lead is `deeptrading/deeptrading-team-lead`.
- The lead must orchestrate members with the `task` tool only.
- Every `task.subagent_type` must be one of the fully qualified member IDs from `expert.json`.
- Do not call external trading MCP services as a substitute for team orchestration.
- Do not simulate member reports in the lead context. Member analysis must come from member subagents.
- Parallel phases should launch multiple `task` calls in the same assistant turn when the runtime supports it.
- Serial phases must wait for the previous phase's task results before continuing.

## Team Boundary

There is no separate team-creation tool. At the start of an analysis, the lead should state the team boundary in text, then dispatch member tasks.

## Data Access

Members should prefer the bundled `neodata-financial-search` skill. If credentials or upstream data are unavailable, members must state the limitation instead of inventing current market data.

## Disclaimer

All outputs are for academic research, engineering experiments, and teaching demonstrations only — they do not constitute investment advice. Every report must end with "本报告不构成投资建议".
