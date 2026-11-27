# Resource recovery record

The chief scientist maintains `outputs/resource-recovery/plan.json`, append-only `attempts.jsonl`, `assets.json`, and final `review.md`. Use English for benchmark artifacts. These are workflow records, not proof that an experiment succeeded. Do not add these objects to research-guidance plan.json; link the relevant claim and deliverable IDs instead.

Suggested plan structure:

```json
{
  "schema_version": "1.0",
  "input_policy": {"external_public_resources": "allowed_for_reference", "resource_policy_version": "reference-use-v2", "basis": "Public official assets may support reference experiments; enforce task restrictions and honest report attribution"},
  "budget": {"download_bytes": null, "disk_reserve_bytes": null, "recovery_wall_seconds": null, "compute_plan": null, "basis": "Replace nulls with observed estimates and explicit limits before large retrieval or computation"},
  "gaps": [
    {"id": "R1", "deliverable_ids": [], "claim_ids": [], "kind": "model_missing", "required_asset": "Replace with actual requirement", "acceptance_criteria": [], "owner": "as-code-data-engineer", "candidate_ids": [], "status": "pending", "remaining_conditions": [], "next_action": "Inspect official resources"}
  ]
}
```

Each attempt records `attempt_id`, `gap_id`, `candidate_id`, `timestamp_utc`, `stage`, `query_or_command`, `url`, `observed_outcome`, `log_path`, `elapsed_seconds`, `bytes_transferred`, `decision`, and `next_action`. Never log credentials. Keep unsuccessful attempts when trying a new route.

Each asset records `asset_id`, `gap_ids`, `kind`, `publisher`, `source_url`, `resolved_source`, `version_or_commit`, `license`, `permitted_use`, `local_paths`, `sha256`, `size_bytes`, `selection_or_transform`, `compatibility_checks`, `stage`, `smoke_run_evidence`, `formal_experiment_evidence`, and `limitations`. For remote chunked access, record the source revision/metadata and exact selections/chunks; mark unavailable checksums explicitly instead of inventing them.

Stages: discovered, metadata_checked, acquired, validated, smoke_passed, experiment_completed. Distinguish failed, permission_blocked and budget_exhausted. Record failures per candidate, not by overwriting previous assets as successes. A gap remains open until the required scientific evidence is supplied, even if an asset passed a smoke test.

Final review must state which gaps were recovered, which core experiments actually completed, which remain blocked, what alternatives were attempted, and why any scope reduction is justified. The chief scientist updates task-deliverables, evidence plan, G2/G3, report limitations and manifest accordingly. No hidden checklist, hidden evaluation answer or scoring artifact may be used; public official solutions are reference material only.

Record source/version, intended use and `resource_role` (`reference_only`, `reference_run`, `experiment_input`), plus how the asset influenced implementation or design. Public target code, weights, solutions and result data may be acquired and used for reference experiments; target relation alone is not permission_blocked. Do not copy official artifacts or metrics into current-run main results. Label newly executed official-code runs as reference reproductions with local logs; never claim independent implementation. Audit every main figure/result back to current-run computation, and record reference-use-v2 in the manifest.
