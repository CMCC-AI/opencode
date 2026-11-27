# Objective preservation and scientific completion

The benchmark entry now registers task-derived scientific objectives before experiments. It keeps an INSTRUCTIONS.md snapshot and the initial requirement definitions, conditions, priorities and dependencies under outputs/objective-audit/. These records reduce accidental scope drift; they are not a tamper-proof security boundary or a scientific judge. Hidden checklists and scoring files are never inputs to this workflow.

1. Read templates/task-deliverables.md and use objective-audit prepare/save with schema_version 3.0. State scientific questions as well as file deliverables. Preserve original requirements; append newly discovered necessities.
2. At first main results, before drafting and before release, audit unresolved P0 work. Missing truth, baselines, cohorts or protocols require gap/recovery entries linked to real search, acquisition, compatibility or restriction evidence. Work on executable core dependencies before extensions.
3. Reviewers inspect the task, actual input conditions, outputs and images. Record each acceptance criterion and target condition, and distinguish input reanalysis, official-code reference reruns and independent execution. A true negative result may pass; unexecuted or incompatible proxy experiments may not.
4. Keep independent reliability and goal_coverage reviews separate. A credible partial report can pass reliability while remaining incomplete.
5. validate-benchmark-output.sh now calls the objective audit after structural checks. It exits 20 if the ledger is missing, original conditions were changed, core work is unresolved, evidence is missing or independent reviews did not pass. The launcher makes one bounded recovery pass, then retains failure when still incomplete.

The audit verifies definitions, states and evidence references, not whether the observations are true or whether the original planning omitted a scientific requirement. Final goal-coverage review must re-read INSTRUCTIONS.md and append omitted P0 items. No task-specific target numbers or domain answer patterns are embedded.

## Existing workspaces

Do not mark an old run completed by filling in passing reviews. Migrate the existing ledger explicitly to 2.0, preserving all original requirements and inspecting the earlier task scope. Supply real recovery and content review records. Old workspaces without these records intentionally fail the new completion gate. Fresh runs register automatically through the agent workflow.

## Validation

Run `bash tests/test-clawbenchmark.sh` for unit, launcher, recovery-policy and completion-gate checks. On Node 20 the TypeScript tool test uses the existing Bun runtime; on Node 22+ it uses Node type stripping. Run `~/.bun/bin/bun tests/smoke-objective-tool.mjs` to invoke the actual new tool. Resolve the benchmark agent with `OPENCODE_CONFIG=$PWD/opencode.json OPENCODE_CONFIG_DIR=$PWD/.opencode opencode debug agent ai-scientist-benchmark` and confirm objective-audit is enabled. No full scientific benchmark improvement is established by these engineering tests.

## Version 3 research contract
The source-unit map requires independent coverage of each scientific task line. It is a semantic review aid: reviewers must split compound requirements and challenge input/context classifications. Seven data dimensions expose incompatible inputs before execution. Staged resource recovery requires actual experiment evidence; restrictions preserve incomplete status. Figure contracts require actual PNG inspection, field-level comparisons and image hash binding. Execution, delivery, reliability and original-goal completion are separate. Mechanical checks do not establish truth or score improvement.
Use schema 3.0 and templates/task-deliverables.md. Save using ledger_path=outputs/task-deliverables.json or full ledger_json. Existing runs require real migration and review. Resource recovery defaults to kind=resource; use kind=computation for a missing local computation, which requires successful validate and experiment stages without external acquisition. Preserve definitions and append newly discovered requirements. Run node --test tests/test-objective-audit.mjs tests/test-research-contract.mjs, bash tests/test-clawbenchmark.sh and the Bun tool smoke test.
