#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace="${1:-}"
[[ -n "$workspace" && -d "$workspace" ]] || {
  echo "ERROR: usage: validate-benchmark-output.sh <workspace>" >&2
  exit 64
}

introduction="$workspace/Introduction.md"
validation_report="$workspace/outputs/validation-report.md"

report="$workspace/report/report.md"
images="$workspace/report/images"
fail() {
  local reason="$*"
  mkdir -p "$workspace/outputs"
  {
    echo '# Benchmark Output Validation'
    echo
    echo '## Status'
    echo 'FAILED'
    echo
    echo '## Reasons'
    echo "- $reason"
    echo
    echo '## Recovery'
    echo 'Inspect this report and Introduction.md, repair the responsible research workflow, and rerun validation. If the issue cannot be resolved with available resources, document the blocker and evidence in report/report.md.'
  } > "$validation_report"
  echo "FAIL: $reason" >&2
  exit 20
}

[[ -s "$report" ]] || fail "missing or empty report/report.md"
[[ -d "$images" ]] || fail "missing directory report/images"
find "$images" -type f -iname '*.png' -size +0c -print -quit | grep -q . || fail "report/images/ contains no non-empty PNG"
rg -qi '(^|[^[:alnum:]])methodology([^[:alnum:]]|$)' "$report" || fail "report lacks methodology section"
rg -qi '(^|[^[:alnum:]])results([^[:alnum:]]|$)' "$report" || fail "report lacks results section"
rg -qi '(^|[^[:alnum:]])limitations([^[:alnum:]]|$)' "$report" || fail "report lacks limitations section"
rg -q 'images/[^ )]+\.png' "$report" || fail "report does not reference a PNG using a relative images/ path"
find "$workspace/code" "$workspace/outputs" \
  -path "$workspace/outputs/research-guidance" -prune -o \
  -type f -size +0c ! -name 'validation-report.md' -print -quit 2>/dev/null | grep -q . || fail "no traceable code or output found"

if [[ -s "$introduction" ]]; then
  requirements=()
  while IFS= read -r line; do
    if [[ "$line" =~ ^[[:space:]]*[-*][[:space:]]+(.+)$ ]]; then
      item="${BASH_REMATCH[1]}"
      [[ "$item" =~ [A-Za-z]{3} ]] && requirements+=("$item")
    fi
  done < "$introduction"
  missing=()
  for requirement in "${requirements[@]}"; do
    if ! rg -qi --fixed-strings "$requirement" "$report"; then
      missing+=("$requirement")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    {
      echo '# Benchmark Output Validation'
      echo
      echo '## Status'
      echo 'FAILED'
      echo
      echo '## Missing Introduction Requirements'
      printf -- '- %s\n' "${missing[@]}"
      echo
      echo '## Recovery'
      echo 'Repair the responsible research workflow or report, then rerun validation. If impossible, document the blocker and evidence in report/report.md.'
    } > "$validation_report"
    echo 'FAIL: report does not satisfy Introduction.md requirements; see outputs/validation-report.md' >&2
    exit 20
  fi
fi

# Scientific outcomes and goal alignment must pass independently of file delivery.
if ! node "$project_root/scripts/research-guidance.mjs" audit "$workspace"; then
  fail "Scientific outcome or original-goal alignment failed; inspect outputs/research-guidance/scientific-audit.json for unmet scientific requirements."
fi

# File checks cannot establish scientific completion. Fail closed on missing
# objectives, unresolved P0 work or absent independent content reviews.
if ! node "$project_root/scripts/objective-audit.mjs" audit "$workspace"; then
  fail "Structural checks passed, but original-goal validation did not pass; inspect outputs/objective-audit/audit.json and repair the responsible workflow."
fi

{
  echo '# Benchmark Output Validation'
  echo
  echo '## Status'
  echo 'PASSED'
  echo
  echo 'Structural and Introduction.md content checks passed.'
  echo 'Original-goal ledger and independent-review references passed mechanical checks; see outputs/objective-audit/audit.json. Scientific validity still depends on the recorded content reviews.'
} > "$validation_report"

echo "PASS: ResearchClawBench output and content contract passed: $workspace"
