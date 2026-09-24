# DeepGeo 位置决策专家团 Rules

This expert package runs inside OpenCode, not WorkBuddy.

## Runtime Contract

- The team lead is `deepgeo/deepgeo-team-lead`.
- The lead must orchestrate members with the `task` tool only, always passing `workdir` = the session workspace.
- Every `task.subagent_type` must be one of the fully qualified member IDs from `expert.json` (`deepgeo/dg-*`).
- `pipeline-state.mjs` ledger commands use the DAG short names (`dg-*`); do not mix the two naming schemes.
- All members follow Skill `deepgeo-pipeline`: the lead passes `workspace_dir` and `SKILL_DIR` in every dispatch prompt.
- Do not simulate member reports in the lead context. Member analysis must come from member subagents.
- Parallel domain phases (`location/audience/commercial/market`) should launch multiple `task` calls in the same assistant turn when dependencies are satisfied.
- Serial phases must wait for the previous phase's task results before continuing.

## Team Boundary

There is no separate team-creation tool. At the start of an analysis, the lead should state the team boundary in text, then dispatch member tasks.

## Data Access

- Core numbers must come from the deterministic Python engine (`python3 -m analytics.deepgeo.cli`, `PYTHONPATH` = `deepgeo-pipeline` skill dir); never estimate in conversation.
- `dg-market-researcher` is the only member allowed to touch the public web (`websearch`/`webfetch`); it must never read the workspace or internal data.
- Original user case files are read-only; raw personal trajectory data must never enter the system.
- Missing data stays blank or is declared as an evidence gap; it is never filled with guesses or zeros.

## Output Discipline

- **No** greetings: "好的", "收到", "作为XX专家", "我将综合", "下面是".
- **No** meta-narration: "我将采用SCQA逻辑", "本节将达到".
- Internal tracking IDs (recipe names, run IDs, claim IDs, workspace paths, DAG node names) must never appear in final user-visible reports.
- Simulated data must be marked as such by the data-mode files and publishing scripts; it is never described as real customer facts.
- Correlation must not be written as causation; predictions present ranges, backtest error and failure conditions, never promises.
- The final answer must list real artifacts, invoked and skipped experts, data mode, analysis status, review status, open items and next steps.

## Delivery Contract

- `report_editing` must pass the deterministic quality preflight (`quality-preflight.mjs`) inside the same task before independent review.
- Independent review only samples high-risk content; P1/P2 never trigger rework; only new P0s allow one targeted repair by `dg-report-editor` plus one focused re-check.
- Formal release requires `release-decision.json` with `decision=pass` and zero P0; internal previews must be labeled as such.
- Clean delivery (`finalize-delivery.mjs <workspace> <output-dir>`) publishes only `report.md`, `report.html`, `report.pdf`, used charts and the hidden minimal audit file.

## Member Return Format

Each member return must include:
1. Task understanding (what analysis task was received)
2. Tools used and key inputs
3. Generated/updated file names or content
4. Core conclusions (concise)
5. Data gaps (what dimensions of data are missing)
6. Acceptance status and remaining risks
