#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

bash scripts/validate-clawbenchmark.sh
bash -n scripts/ai-scientist-oc-bench
bash -n scripts/validate-benchmark-output.sh

fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/code" "$fixture/outputs" "$fixture/report/images"
printf '# Introduction\n\n- Reproducible method\n' > "$fixture/Introduction.md"
printf '# Results\n\n## Methodology\nReproducible method.\n\n## Results\n![Figure](images/main.png)\n\n## Limitations\nNo known limitations in this fixture.\n' > "$fixture/report/report.md"
printf 'print("reproducible")\n' > "$fixture/code/analysis.py"
printf 'not-a-real-png-but-nonempty-fixture\n' > "$fixture/report/images/main.png"

printf 'Evaluate the defined cohort with independent repeated runs.
' > "$fixture/INSTRUCTIONS.md"
if bash scripts/validate-benchmark-output.sh "$fixture"; then
  echo 'FAIL: structural artifacts without goal verification passed' >&2
  exit 1
fi
node --input-type=module - "$fixture" <<'JS'
import fs from 'node:fs'
import path from 'node:path'
import { completeLedger } from './tests/objective-fixture.mjs'
import { completeScientificFixture } from './tests/scientific-fixture.mjs'
import { writeObjectives } from './.opencode/lib/objective-audit.mjs'
import { taskUnits } from './.opencode/lib/research-contract.mjs'
const workspace = process.argv[2]
for (const p of ['outputs/result.json', 'outputs/reliability.md', 'outputs/coverage.md']) fs.writeFileSync(path.join(workspace, p), 'Explicit integration fixture evidence')
const ledger = completeLedger()
ledger.scope_review.units = taskUnits(workspace).map(u => ({id:u.id,sha256:u.sha256,disposition:'requirement',rationale:'Fixture scientific and reproducibility requirements are covered',item_ids:['D1']}))
writeObjectives(workspace, ledger)
completeScientificFixture(workspace)
JS
bash scripts/validate-benchmark-output.sh "$fixture"
bash scripts/ai-scientist-oc-bench --prompt 'smoke test' --workspace "$fixture" --dry-run | rg -q 'DRY-RUN'

echo "PASS: ResearchClawBench launcher 与输出校验器冒烟测试通过"
