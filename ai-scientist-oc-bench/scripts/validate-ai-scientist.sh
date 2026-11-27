#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail() { echo "FAIL: $*" >&2; exit 1; }
require_file() { [[ -f "$1" ]] || fail "缺少文件 $1"; }
require_text() { local normalized; normalized="$(tr -d '\r' < "$1")"; rg -q -- "$2" <<< "$normalized" || fail "$1 缺少关键内容: $2"; }

require_file opencode.json
require_file AGENTS.md
require_file .opencode/agents/ai-scientist-benchmark.md

agents=(.opencode/agents/as-*.md)
(( ${#agents[@]} >= 18 && ${#agents[@]} <= 30 )) || fail "当前核心专家数应在 18–30，实际为 ${#agents[@]}"

for file in "${agents[@]}"; do
  require_text "$file" '^mode: subagent$'
  require_text "$file" 'task: deny'
  require_text "$file" '中文'
  require_text "$file" '输出契约'
  require_text "$file" '完成前自检'
done

require_text .opencode/agents/ai-scientist-benchmark.md '"as-\*": allow'
require_text .opencode/agents/ai-scientist-benchmark.md 'Gather.*Act.*Verify.*Adjust'
for gate in G1 G2 G3 G4; do
  require_text .opencode/agents/ai-scientist-benchmark.md "$gate"
done
require_text .opencode/agents/ai-scientist-benchmark.md '不得.*伪造'

for skill in literature-review paper-analysis experimental-methodology scientific-writing research-integrity; do
  require_file ".opencode/skills/$skill/SKILL.md"
  require_text ".opencode/skills/$skill/SKILL.md" '中文'
done

for tool in academic-search citation-verify hardware-profile artifact-validate context-log execution-state failure-memory; do
  require_file ".opencode/tools/$tool.ts"
done

jq -e . opencode.json >/dev/null
for schema in contracts/*.schema.json; do
  jq -e . "$schema" >/dev/null
done


node --test tests/test-chief-delegation.mjs tests/test-libraries.mjs
bash tests/test-scaffold.sh
bash tests/test-clawbenchmark.sh
node --test tests/test-resource-access.mjs
node --test tests/test-scientific-quality.mjs tests/test-reference-policy.mjs

echo "PASS: AI Scientist 完整校验通过（${#agents[@]} 个核心专家，中文契约与 G1–G4 闸门齐全）"
