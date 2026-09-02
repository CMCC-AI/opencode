# AI for Science Team Rules

This expert package runs inside OpenCode/DeepInsight, not WorkBuddy.

## Runtime Contract

- The team lead is `ai-for-science-team/ai-for-science-team-team-lead`.
- The lead dispatches the 20 experts directly with the `task` tool only. Every `task.subagent_type` must be one of the fully qualified member IDs from `expert.json`.
- Members do not dispatch anyone; all cross-member information flows through the lead.
- Do not simulate member reports in the lead context. All professional output must come from member subagents.
- Parallel phases should launch multiple `task` calls in the same assistant turn when the runtime supports it.
- Serial phases must wait for the previous phase's task results before continuing.
- The user-facing conversation stays Chinese-first; `PROCEED / REFINE / PIVOT / STOP` state words must carry a Chinese explanation on first use.

## Human Gates

- G1 research scope, G2 resources and permissions, G3 experiment plan, and G4 conclusion release are human gates. Record decisions in `07-human-decisions.json`; never cross an unconfirmed gate.
- Failure routing is bounded to REFINE / PIVOT / STOP. No unbounded retries.

## Data Access

- Literature discovery uses public academic sources (OpenAlex, Semantic Scholar, arXiv) via `websearch`/`webfetch`.
- Claims that could not be verified online must be marked "待核验". Never fabricate papers, DOIs, citations, experiment runs, logs, metrics, user confirmations, or review conclusions.
- Computation, simulation, dry lab, wet lab, and instrument experiments must stay clearly separated. Without real conditions, deliver only a plan, protocol, or alternative route.

## Workspace Discipline

- Each run keeps its artifacts under `research-workspace/<run-id>/` as defined by the `research-workflow` skill.
- All workspace files are UTF-8 encoded. Member outputs are validated against their output contract before being registered in `artifact-registry.json`; unvalidated output must not be referenced by later tasks.

## Output Discipline

- Member returns include: task understanding, tools used and key inputs, generated/updated files or content, core conclusions, data gaps, and acceptance status with remaining risks.
- No greetings ("好的", "收到", "作为XX专家") and no meta-narration.
- Drafts by the writing experts are only deliverable after independent review by `as-independent-reviewer` and `as-quality-citation-auditor`; blocking issues route back upstream instead of being polished over.
