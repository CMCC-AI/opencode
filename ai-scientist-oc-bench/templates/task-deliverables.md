# Task deliverables and research contract (schema 3.0)

Run objective-audit prepare first. Read outputs/objective-audit/source-units.json. The planner must map EVERY source unit to scientific requirements or explain why it describes input/context. Re-read the original task independently of the ledger. Split compound requirements into independently testable items. Use current task and authorized scientific material, never hidden checklists, scores, task IDs or prior answers.

Save outputs/task-deliverables.json, then call objective-audit with operation=save and ledger_path=outputs/task-deliverables.json. A complete ledger_json string is also supported; do not pass both. Prepare/save may return incomplete while planning is underway; only final audit requires completion.

```json
{
  "schema_version": "3.0",
  "execution_status": "in_progress",
  "overall_status": "in_progress",
  "scope_review": {
    "status": "pending", "reviewer": "as-research-planner",
    "evidence_paths": ["outputs/scope-review.md"],
    "units": [{"id": "T1", "sha256": "Copy actual prepare hash", "disposition": "requirement", "rationale": "Explain coverage of all clauses", "item_ids": ["D1"]}]
  },
  "items": [{
    "id": "D1", "requirement": "One actual scientific requirement",
    "source_type": "explicit", "source": "INSTRUCTIONS.md: actual section",
    "source_excerpt_or_rationale": "Actual instruction or scientific necessity",
    "priority": "P0", "priority_reason": "Required output or necessary core validation",
    "owner": "as-result-analyst", "depends_on": [],
    "acceptance_criteria": ["Actual computation, comparison and reporting condition"],
    "target_conditions": {"entities": "Actual target entities"},
    "data_requirements": [
      {"dimension": "entities", "expected": "Actual target entities", "observed": "Actual inspected entities", "status": "missing", "rationale": "Explain match or gap", "evidence_paths": ["outputs/input-audit.json"]}
    ],
    "figure_requirements": [{
      "id": "F1", "purpose": "Scientific relationship this plot must establish",
      "variables": "Variables, axes and units", "grouping": "Entity and comparison groups",
      "statistical_unit": "Independent unit and sample count",
      "uncertainty": "Interval definition and independent repetition unit, or justified none",
      "representation": "Representation directly answering the scientific question"
    }],
    "status": "pending", "evidence_paths": [], "report_locations": [],
    "gap": "Actual missing input",
    "recovery": {"state": "active", "reason": "Why recovery is needed", "next_action": "Executable next step", "attempts": []},
    "verification": null
  }],
  "final_reviews": {}
}
```

Expand the illustrative data_requirements row to exactly seven dimensions: entities, sample_size, repeats, protocol, units, baselines, ground_truth. Every row needs expected, observed, status, rationale and evidence_paths. Status is matched, missing, mismatch, unspecified or not_applicable. Use expected=unspecified for unspecified task conditions; do not invent sizes or baselines. Not applicable requires a scientific reason. Inspect actual contents, not filenames. Distinguish experimental entities from simulated observations and repeated runs. Missing/mismatched input creates a gap and recovery; never shrink the target. Update observed data after recovery.

Recovery attempts require stage (restriction_check/search/candidate_audit/acquire/validate/smoke_test/experiment), action, outcome, succeeded and evidence_paths. Link actual query results, command/download logs, compatibility checks and execution outputs. Use outputs/resource-recovery/ for plans and records. Resource recovery resolved requires successful acquisition, validation, smoke test AND experiment evidence; search/download alone do not resolve research. For a local computation gap, fix/run and verify the computation without pretending an external resource was acquired. Restrictions allow restriction_check evidence without unauthorized access. Other states: active, exhausted, permission_blocked, budget_exhausted, input_inconsistent; these retain incomplete status.

Each item needs figure_requirements. If no scientific plot applies, use [] and explain no_figure_reason. Never waive a required plot. Derive representation from the scientific question, not an expected benchmark image. Show continuous relationships explicitly when needed; keep distinct experimental entities separate.

Verified items retain verification.checks (criterion/matched/observation/evidence_paths), verification.conditions (name/expected/observed/matched/evidence_paths), reviewer, verdict=passed, report_locations and result_origin (kind=input_reanalysis/reference_rerun/independent_run/mixed plus description). Required figures additionally need verification.figures: id, reviewer, matched, image_inspected, observation, image_path, image_sha256, data_paths, checks. Hash actual PNG bytes. Checks contain name, expected, observed, matched for variables, grouping, statistical_unit, uncertainty, representation; expected must equal the figure contract. Review actual rendered images and underlying data. Changed images require renewed review; inaccessible images cannot pass.

Final reviews reliability and goal_coverage each need status, independent reviewer and evidence_paths. Goal coverage must re-read original source units, inspect scope_review, append omitted P0 requirements and route repairs before passing. Reliability may pass for a credible partial report while original_goal remains incomplete. execution_status describes execution only (in_progress/succeeded/failed); file delivery and reliability are separate audit outputs. All P0 items require compatible data and reviewed figures before overall_status=completed. Valid negative results may pass; unexecuted or incompatible proxies cannot.

Preserve original requirement definitions, conditions, priorities, acceptance criteria and figure definitions; append discovered requirements. Existing 2.0 ledgers require explicit migration and fresh scope/data/figure reviews, never fabricated passing records.
