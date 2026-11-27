# Scientific outcomes, original goals and evidence validation

This gate distinguishes authentic execution, a scientifically interpretable finding and fulfillment of an original practical goal. It never requires a desired sign for a legitimate hypothesis test and never authorizes changing inputs or inventing results.

## Before execution

Read the applicable method branches from the bundled catalog. For every claim, supply a `goal_contract` in the research-guidance plan:

```json
{
  "intent": "capability",
  "requirement_ids": ["D2"],
  "source_excerpt": "An exact excerpt from the current INSTRUCTIONS.md",
  "target_conditions": "Original object, dimensions, method obligations, protocol, budget, reference and evidence level; unknowns explicit",
  "metrics": [{
    "id": "primary-error",
    "quantity": "Held-out prediction MAE",
    "unit": "Use the actual source unit, or explicitly unspecified",
    "definition": "Mean absolute error on independent task-defined test entities",
    "acceptance": "Task-derived adequacy criterion or justified comparison; no historical numeric target",
    "direction": "minimize",
    "check": {
      "artifact": "outputs/comparison.json",
      "pointer": "/method/mae",
      "operator": "lt",
      "reference": {"artifact": "outputs/comparison.json", "pointer": "/baseline/mae"}
    }
  }],
  "verification_command": "A real independent verifier of the frozen scientific outcome"
}
```

`intent` is capability, hypothesis or delivery. Hypothesis criteria describe adequacy of the test, not a requirement for a positive effect. Primary numeric checks are appropriate when independently computable; qualitative claims still need independent content assessment. Do not impose metric families on unrelated tasks. The original goal contract is frozen in goal-baseline.json: a new method/auxiliary question gets a separate claim without deleting the original. Scientific success/refutation text may be revised transparently, but cannot weaken that contract. A planner must compare this mapping to the original task before execution; source quoting is necessary provenance, not proof of coverage.

## At first main results, before drafting and release

Evaluated plan updates check measured criteria immediately. Ask the independent reviewer to inspect input semantics, code, actual outputs and original goal conditions. Persist the returned assessment with `research-guidance(operation="review", review_json=...)`:

```json
{
  "claim_id": "claim-1",
  "reviewer": "as-independent-reviewer",
  "alignment": "matched",
  "observation": "Describe actual versus original object, method, dimensions, quantity, units, budget and reference",
  "criteria": [{"metric_id":"primary-error", "status":"met", "observed":"Describe the actual measurement", "unit":"same as the frozen metric"}],
  "evidence_paths": ["outputs/comparison.json", "code/model.py"]
}
```

Alignment is matched, major_deviation or unverified. Each criterion is met, not_met or missing. The review is hash-bound to the scientific design, current claim evidence and original instructions. It becomes stale on relevant changes. Every P0 ledger item needs a claim mapping. Read-only workers return assessments; chief saves them. A reviewer label and numeric check cannot prove a scientific conclusion; reviewers must independently challenge weak or incomplete contracts.

`research-guidance audit` checks both references and scientific outcomes. Release validation runs it even if report files exist. Failed capabilities, missing metrics, major goal deviation, stale or missing reviews and omitted P0 requirements remain explicit failures. Chief may arrange focused correction through existing experts within the task budget. Audits do not create repair incidents or interrupt ordinary tools. Changed results require fresh independent review.

Do not fix a missing review by unnecessary training. Reassess after the relevant correction. If input, permission or budget prevents the original goal, keep incomplete/blocked and deliver an honest limited report. A negative result can be valid evidence without satisfying a required capability. A different generator, synthetic objective, budget or physical unit cannot close the failed original goal merely by being disclosed.

## Library maintenance

Version 1.1.0 adds eight general branches: goal fidelity; prediction diagnostics; generative validation; optimization efficiency; physical observables; structural/biological validation; spatiotemporal inference; algorithmic correctness. They describe quantities, unit conventions, comparison definitions and diagnostic procedures. They contain no source task IDs, scoring weights, expected numerical achievements or expected conclusions. Units are examples only, never a license to assign absent physical semantics. Offline provenance is kept in maintenance/metric-source-provenance.json; source checklists are not deployed or read by the research agent. Existing workspaces retain their old library snapshots and must not be silently migrated.

Scientific-outcome execution success enters awaiting_scientific_review. Normal execution stays paused; only plan updates, independent reviewer dispatch and research-guidance review/audit are permitted. Fresh content review resolves the incident only if frozen metrics and original-goal alignment pass; otherwise it returns to diagnosis or exhausts the same two-attempt budget.
