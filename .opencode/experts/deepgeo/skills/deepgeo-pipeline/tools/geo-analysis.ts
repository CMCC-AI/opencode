import { tool } from "@opencode-ai/plugin"
import z from "zod"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"

// This file lives in the DeepGeo pipeline skill (`skills/deepgeo-pipeline/tools/`).
// The Python package sits beside it in `skills/deepgeo-pipeline/analytics/`, so the
// skill root (one level up from this directory) is the package parent. cwd must
// never be used as the package root. When embedded as an expert team the session
// workspace lives outside the skill, so DEEPGEO_WORKSPACE_ROOT /
// DEEPGEO_INPUT_ROOTS let the host scope the tool to the injected directories.
const RUNTIME_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const CASES_ROOT = path.resolve(RUNTIME_ROOT, "../cases")
const HIDDEN_FIXTURES_ROOT = path.resolve(RUNTIME_ROOT, "tests/fixtures/cases")
const WORKSPACE_ROOT = process.env.DEEPGEO_WORKSPACE_ROOT
  ? path.resolve(process.env.DEEPGEO_WORKSPACE_ROOT)
  : path.resolve(RUNTIME_ROOT, "tmp/deepgeo-workspace")
const EXTRA_INPUT_ROOTS = (process.env.DEEPGEO_INPUT_ROOTS ?? "")
  .split(path.delimiter)
  .filter(Boolean)
  .map((item) => path.resolve(item))

const ALLOWED_RECIPES = [
  "quality.profile",
  "temporal.pattern",
  "temporal.anomaly",
  "mobility.dwell",
  "mobility.od",
  "audience.mix",
  "audience.association",
  "commercial.diversity",
  "commercial.supply_gap",
  "decision.score",
  "decision.stability",
  "forecast.baseline",
  "pilot.did",
  "finance.scenario",
  "finance.monte_carlo",
] as const

export default tool({
  description: "运行 DeepGeo 共享的确定性 CPU 数据分析 recipe，记录输入、参数、耗时和结果。多个领域专家均可使用；不允许执行任意 Python 代码。",
  args: {
    recipe: z.enum(ALLOWED_RECIPES),
    inputs: z.array(z.string()).min(1).max(4),
    parameters: z.record(z.string(), z.unknown()).default({}),
    producer: z.string().min(1),
    output: z.string().min(1),
  },
  async execute(args) {
    const resolvedInputs = args.inputs.map((item) => path.resolve(RUNTIME_ROOT, item))
    const resolvedOutput = path.resolve(RUNTIME_ROOT, args.output)
    const isInside = (parent: string, target: string) => target === parent || target.startsWith(parent + path.sep)
    for (const input of resolvedInputs) {
      const isAllowedInput =
        (isInside(RUNTIME_ROOT, input) || isInside(CASES_ROOT, input) || EXTRA_INPUT_ROOTS.some((root) => isInside(root, input))) &&
        !isInside(HIDDEN_FIXTURES_ROOT, input)
      if (!isAllowedInput || !fs.existsSync(input) || !fs.statSync(input).isFile()) {
        throw new Error(`输入文件不存在或越界：${input}`)
      }
    }
    if (!isInside(WORKSPACE_ROOT, resolvedOutput)) throw new Error("输出必须位于 tmp/deepgeo-workspace/<run-id>/ 内")
    const cliArgs = ["-m", "analytics.deepgeo.cli", "run", "--recipe", args.recipe]
    for (const input of resolvedInputs) cliArgs.push("--input", input)
    cliArgs.push("--params", JSON.stringify(args.parameters), "--producer", args.producer, "--output", resolvedOutput)
    const pythonPath = [RUNTIME_ROOT, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)
    const stdout = execFileSync("python3", cliArgs, {
      cwd: RUNTIME_ROOT,
      env: { ...process.env, PYTHONPATH: pythonPath },
      encoding: "utf8",
      timeout: 310_000,
      maxBuffer: 1024 * 1024,
    })
    return stdout.trim()
  },
})
