#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
fail() { echo "FAIL: $*" >&2; exit 1; }
require_file() { [[ -f "$1" ]] || fail "缺少文件 $1"; }
require_text() { rg -q -- "$2" "$1" || fail "$1 缺少关键内容: $2"; }

for file in benchmark/auto-gates.json .opencode/agents/ai-scientist-benchmark.md \
  scripts/ai-scientist-oc-bench scripts/validate-benchmark-output.sh \
  examples/researchclawbench-agent.json .opencode/tools/dataset-discovery.ts \
  .opencode/tools/research-guidance.ts .opencode/research-guidance/catalog.json \
  scripts/research-guidance.mjs tests/test-research-guidance.mjs \
  .opencode/research-guidance/resource-recovery.md templates/resource-recovery.md; do
  require_file "$file"
done

jq -e . benchmark/auto-gates.json >/dev/null
jq -e . examples/researchclawbench-agent.json >/dev/null
require_text .opencode/agents/ai-scientist-benchmark.md '^mode: primary$'
require_text .opencode/agents/ai-scientist-benchmark.md 'question: deny'
require_text .opencode/agents/ai-scientist-benchmark.md '"as-\*": allow'
for gate in G1 G2 G3 G4; do
  require_text .opencode/agents/ai-scientist-benchmark.md "$gate"
done
require_text .opencode/agents/ai-scientist-benchmark.md 'report/report.md'
require_text scripts/ai-scientist-oc-bench '--agent ai-scientist-benchmark'
require_text scripts/ai-scientist-oc-bench 'OPENCODE_CONFIG_DIR'
node --test tests/test-research-guidance.mjs tests/test-objective-audit.mjs tests/test-research-contract.mjs

echo "PASS: ResearchClawBench 适配层静态校验通过"
