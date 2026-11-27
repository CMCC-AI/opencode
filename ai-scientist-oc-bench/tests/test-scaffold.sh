#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail() { echo "FAIL: $*" >&2; exit 1; }
require_file() { [[ -f "$1" ]] || fail "缺少文件 $1"; }
require_text() { local normalized; normalized="$(tr -d '\r' < "$1")"; rg -q -- "$2" <<< "$normalized" || fail "$1 缺少关键内容: $2"; }

for file in opencode.json AGENTS.md README.md .gitignore .opencode/package.json \
  .opencode/agents/ai-scientist-benchmark.md scripts/validate-ai-scientist.sh; do
  require_file "$file"
done

agents=(
  as-intent-router as-asset-auditor as-research-planner as-feasibility-advisor
  as-literature-strategist as-literature-researcher as-paper-evidence-analyst
  as-research-synthesizer as-methodology-designer as-experiment-designer
  as-code-data-engineer as-experiment-operator as-experiment-diagnostician
  as-result-analyst as-outline-architect as-evidence-writer
  as-figure-citation-editor as-independent-reviewer as-quality-citation-auditor
  as-research-package-curator
)

for agent in "${agents[@]}"; do
  file=".opencode/agents/${agent}.md"
  require_file "$file"
  require_text "$file" '^mode: subagent$'
  require_text "$file" 'task: deny'
  require_text "$file" '中文'
  require_text "$file" '输出契约'
  require_text "$file" '完成前自检'
done

skills=(literature-review paper-analysis experimental-methodology scientific-writing research-integrity)
for skill in "${skills[@]}"; do
  require_file ".opencode/skills/${skill}/SKILL.md"
done

tools=(academic-search citation-verify hardware-profile artifact-validate context-log execution-state failure-memory)
for tool in "${tools[@]}"; do
  require_file ".opencode/tools/${tool}.ts"
done

schemas=(research-project takeover-plan evidence-claim experiment-plan experiment-run research-package context-invocation-log execution-state failure-memory)
for schema in "${schemas[@]}"; do
  require_file "contracts/${schema}.schema.json"
  jq -e . "contracts/${schema}.schema.json" >/dev/null
done

require_text .opencode/agents/ai-scientist-benchmark.md '"as-\*": allow'
require_text .opencode/agents/ai-scientist-benchmark.md 'Gather.*Act.*Verify.*Adjust'
require_text .opencode/agents/ai-scientist-benchmark.md 'G1'
require_text .opencode/agents/ai-scientist-benchmark.md 'G4'
require_text .opencode/agents/ai-scientist-benchmark.md '不得.*伪造'
require_text AGENTS.md '@ai-scientist'
require_text AGENTS.md '中文'

echo "PASS: AI Scientist 项目架子契约检查通过（${#agents[@]} 个核心专家）"
