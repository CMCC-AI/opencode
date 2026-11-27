$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$required = @(
  'benchmark/auto-gates.json',
  '.opencode/agents/ai-scientist-benchmark.md',
  'scripts/ai-scientist-oc-bench',
  'scripts/validate-benchmark-output.sh',
  'scripts/validate-clawbenchmark.sh',
  '.opencode/tools/dataset-discovery.ts',
  'examples/researchclawbench-agent.json',
  '.opencode/tools/research-guidance.ts',
  '.opencode/research-guidance/catalog.json',
  'scripts/research-guidance.mjs',
  '.opencode/research-guidance/resource-recovery.md',
  'templates/resource-recovery.md'
)

foreach ($relativePath in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $relativePath))) {
    throw "缺少文件：$relativePath"
  }
}

$gates = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'benchmark/auto-gates.json') | ConvertFrom-Json
if ($gates.profile -ne 'researchclawbench-v1') { throw '自动闸门档案标识错误' }
foreach ($gate in 'G1', 'G2', 'G3', 'G4') {
  if ($null -eq $gates.gates.$gate) { throw "缺少自动闸门：$gate" }
}

$agent = Get-Content -Raw -Encoding UTF8 (Join-Path $root '.opencode/agents/ai-scientist-benchmark.md')
foreach ($expected in @('mode: primary', 'question: deny', '"as-*": allow', 'report/report.md', 'G1', 'G2', 'G3', 'G4', '研究规划')) {
  if (-not $agent.Contains($expected)) { throw "benchmark Agent 缺少：$expected" }
}

$launcher = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'scripts/ai-scientist-oc-bench')
foreach ($expected in @('--agent ai-scientist-benchmark', 'OPENCODE_CONFIG_DIR', 'validate-benchmark-output.sh')) {
  if (-not $launcher.Contains($expected)) { throw "launcher 缺少：$expected" }
}

$preset = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'examples/researchclawbench-agent.json') | ConvertFrom-Json
if (-not $preset.ai_scientist_opencode.cmd.Contains('--prompt <PROMPT> --workspace <WORKSPACE>')) {
  throw 'ResearchClawBench 配置样例缺少输入输出占位符'
}

Write-Output 'PASS: ResearchClawBench 适配层 PowerShell 静态校验通过'
