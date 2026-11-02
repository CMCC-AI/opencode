#!/usr/bin/env node
/**
 * profile-expert-run.mjs — 专家团运行耗时画像（只读，不改任何数据）
 *
 * 用法:
 *   node script/profile-expert-run.mjs                     # 自动找最近一次专家团运行
 *   node script/profile-expert-run.mjs --session <id>      # 指定根会话
 *   node script/profile-expert-run.mjs --trace <path>      # 对齐 00-execution-trace.json
 *   node script/profile-expert-run.mjs --db <path>         # 覆盖 DB 路径
 *   node script/profile-expert-run.mjs --json              # 机器可读输出
 *
 * 数据源: ~/.local/share/opencode/opencode.db（只读）+ 可选 pipeline-state 台账。
 */
import { DatabaseSync } from "node:sqlite"
import { existsSync, readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const args = process.argv.slice(2)
function opt(name) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const jsonMode = args.includes("--json")
const dbPath = opt("db") ?? path.join(os.homedir(), ".local", "share", "opencode", "opencode.db")
const tracePath = opt("trace")

if (!existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`)
  process.exit(1)
}

const db = new DatabaseSync(dbPath, { readOnly: true })

// ---------- schema helpers ----------

const sessionRows = db
  .prepare(
    `SELECT id, parent_id, title, agent, time_created, time_updated,
            tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write
     FROM session`,
  )
  .all()

const childrenOf = new Map()
for (const row of sessionRows) {
  if (!row.parent_id) continue
  const list = childrenOf.get(row.parent_id) ?? []
  list.push(row)
  childrenOf.set(row.parent_id, list)
}

function findRoot() {
  const flag = opt("session")
  if (flag) {
    const row = sessionRows.find((x) => x.id === flag)
    if (!row) throw new Error(`session not found: ${flag}`)
    return row
  }
  // task 工具创建的子代理会话标题形如 "描述 (@agent subagent)"
  const isSubagent = (row) => /\(@.+ subagent\)$/.test(row.title ?? "")
  // 专家团主理人 = 拥有最多直接子代理会话的会话；取最近一次运行的
  const candidates = sessionRows
    .map((row) => ({ row, kids: (childrenOf.get(row.id) ?? []).filter(isSubagent).length }))
    .filter((x) => x.kids >= 2)
    .sort((a, b) => b.row.time_updated - a.row.time_updated)
  if (args.includes("--list")) {
    for (const c of candidates.slice(0, 10)) {
      console.log(
        `${c.row.id}  agent=${c.row.agent ?? "-"}  subagents=${c.kids}  updated=${new Date(c.row.time_updated).toISOString()}  ${c.row.title}`,
      )
    }
    process.exit(0)
  }
  if (candidates.length === 0) throw new Error("no expert-team run found (no session has 2+ subagent children)")
  return candidates[0].row
}

const root = findRoot()

// 递归收集整棵会话树
const tree = []
function walk(row, depth) {
  tree.push({ row, depth })
  for (const child of childrenOf.get(row.id) ?? []) walk(child, depth + 1)
}
walk(root, 0)

// ---------- message / part parsing ----------

const msgStmt = db.prepare(`SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created`)
const partStmt = db.prepare(`SELECT message_id, data FROM part WHERE session_id = ?`)

function parseSession(id) {
  const turns = []
  const tools = []
  const toolMsByMsg = new Map()
  let firstAt = Infinity
  let lastAt = 0
  for (const row of partStmt.all(id)) {
    let data
    try {
      data = JSON.parse(row.data)
    } catch {
      continue
    }
    if (data.type !== "tool") continue
    const start = data.state?.time?.start
    const end = data.state?.time?.end
    if (typeof start !== "number") continue
    lastAt = Math.max(lastAt, end ?? start)
    const duration = typeof end === "number" ? end - start : undefined
    tools.push({
      messageID: row.message_id,
      tool: data.tool,
      start,
      end,
      duration,
      status: data.state?.status,
      title: data.state?.title ?? data.state?.input?.command ?? "",
    })
    if (duration !== undefined) {
      toolMsByMsg.set(row.message_id, (toolMsByMsg.get(row.message_id) ?? 0) + duration)
    }
  }
  for (const row of msgStmt.all(id)) {
    let data
    try {
      data = JSON.parse(row.data)
    } catch {
      continue
    }
    firstAt = Math.min(firstAt, row.time_created)
    lastAt = Math.max(lastAt, row.time_created)
    if (data.role === "assistant") {
      const created = data.time?.created ?? row.time_created
      const completed = data.time?.completed
      const duration = completed ? completed - created : undefined
      if (completed) lastAt = Math.max(lastAt, completed)
      // 回合时长包含本回合内工具执行（含 task 前台等待子代理），扣除后才是纯 LLM 生成耗时
      const toolMs = toolMsByMsg.get(row.id) ?? 0
      turns.push({
        created,
        completed,
        duration,
        llmOnly: duration === undefined ? undefined : Math.max(0, duration - toolMs),
        toolMs,
        tokens: data.tokens,
        model: `${data.providerID}/${data.modelID}`,
        finish: data.finish,
        error: data.error?.name,
      })
    }
  }
  return { turns, tools, firstAt: firstAt === Infinity ? 0 : firstAt, lastAt }
}

const sessions = tree.map(({ row, depth }) => {
  const parsed = parseSession(row.id)
  const llmMs = parsed.turns.reduce((sum, t) => sum + (t.duration ?? 0), 0)
  const llmOnlyMs = parsed.turns.reduce((sum, t) => sum + (t.llmOnly ?? 0), 0)
  const tokens = parsed.turns.reduce(
    (acc, t) => {
      acc.input += t.tokens?.input ?? 0
      acc.output += t.tokens?.output ?? 0
      acc.reasoning += t.tokens?.reasoning ?? 0
      acc.cacheRead += t.tokens?.cache?.read ?? 0
      return acc
    },
    { input: 0, output: 0, reasoning: 0, cacheRead: 0 },
  )
  const toolMs = parsed.tools.reduce((sum, t) => sum + (t.duration ?? 0), 0)
  const byTool = new Map()
  for (const t of parsed.tools) {
    const cur = byTool.get(t.tool) ?? { count: 0, ms: 0 }
    cur.count += 1
    cur.ms += t.duration ?? 0
    byTool.set(t.tool, cur)
  }
  const models = [...new Set(parsed.turns.map((t) => t.model))]
  return {
    id: row.id,
    parent: row.parent_id,
    depth,
    agent: row.agent ?? "?",
    title: row.title,
    wall: parsed.lastAt - parsed.firstAt,
    firstAt: parsed.firstAt,
    lastAt: parsed.lastAt,
    turns: parsed.turns.length,
    incompleteTurns: parsed.turns.filter((t) => t.duration === undefined).length,
    errors: parsed.turns.filter((t) => t.error).length,
    llmMs,
    llmOnlyMs,
    toolMs,
    tokens,
    models,
    byTool: Object.fromEntries([...byTool.entries()].sort((a, b) => b[1].ms - a[1].ms)),
    tools: parsed.tools,
  }
})

const runStart = Math.min(...sessions.map((s) => s.firstAt).filter((x) => x > 0))
const runEnd = Math.max(...sessions.map((s) => s.lastAt))
const wallTotal = runEnd - runStart

// 台账对齐
let trace
if (tracePath && existsSync(tracePath)) {
  const raw = JSON.parse(readFileSync(tracePath, "utf8"))
  trace = (raw.events ?? []).map((e) => ({
    node: e.node,
    agent: e.agent,
    event: e.event,
    at: e.at,
    durationMs: e.duration_ms,
    batch: e.batch,
    artifacts: e.artifacts,
  }))
}

// ---------- 输出 ----------

const fmtMs = (ms) => {
  if (ms === undefined || Number.isNaN(ms)) return "-"
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`
}
const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "-")
const clock = (ms) => new Date(ms).toTimeString().slice(0, 8)

const result = {
  root: { id: root.id, title: root.title, agent: root.agent },
  wall: { start: new Date(runStart).toISOString(), end: new Date(runEnd).toISOString(), totalMs: wallTotal },
  sessions: sessions.map((s) => ({
    id: s.id,
    agent: s.agent,
    depth: s.depth,
    wallMs: s.wall,
    turns: s.turns,
    llmMs: s.llmMs,
    llmOnlyMs: s.llmOnlyMs,
    toolMs: s.toolMs,
    tokens: s.tokens,
    models: s.models,
    byTool: s.byTool,
    errors: s.errors,
  })),
  trace,
}

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

console.log(`\n# 专家团运行画像`)
console.log(`根会话: ${root.title} [${root.id}]`)
console.log(`窗口: ${clock(runStart)} → ${clock(runEnd)}  总墙钟 ${fmtMs(wallTotal)}\n`)

console.log(`## 会话树（按开始时间）`)
console.log(`| 会话(agent) | 开始 | 墙钟 | 回合 | 纯LLM生成 | 工具 | 主要工具 | tokens(in/out/reason) |`)
console.log(`|---|---|---|---|---|---|---|---|`)
for (const s of [...sessions].sort((a, b) => a.firstAt - b.firstAt)) {
  const indent = "　".repeat(s.depth)
  const topTools = Object.entries(s.byTool)
    .filter(([, v]) => v.ms > 500)
    .slice(0, 3)
    .map(([k, v]) => `${k}×${v.count}(${fmtMs(v.ms)})`)
    .join(",")
  console.log(
    `| ${indent}${s.agent} | ${clock(s.firstAt)} | ${fmtMs(s.wall)} | ${s.turns}${s.incompleteTurns ? ` (+${s.incompleteTurns}未完成)` : ""} | ${fmtMs(s.llmOnlyMs)} | ${fmtMs(s.toolMs)} | ${topTools} | ${fmtK(s.tokens.input)}/${fmtK(s.tokens.output)}/${fmtK(s.tokens.reasoning)} |`,
  )
}

// 并行感知的墙钟覆盖：会话区间取并集
function unionMs(intervals) {
  const sorted = intervals.filter((x) => x[1] > x[0]).sort((a, b) => a[0] - b[0])
  let total = 0
  let cur
  for (const iv of sorted) {
    if (!cur || iv[0] > cur[1]) {
      if (cur) total += cur[1] - cur[0]
      cur = [...iv]
    } else {
      cur[1] = Math.max(cur[1], iv[1])
    }
  }
  if (cur) total += cur[1] - cur[0]
  return total
}
const intervals = sessions.map((s) => [s.firstAt, s.lastAt])
const childWall = unionMs(intervals.filter((_, i) => sessions[i].depth > 0))

// 子代理之间的调度间隙（主理人中转/登记/读写的真实耗时）
const children = sessions.filter((s) => s.depth > 0).sort((a, b) => a.firstAt - b.firstAt)
const gaps = []
for (let i = 1; i < children.length; i++) {
  const gap = children[i].firstAt - children[i - 1].lastAt
  if (gap > 0) gaps.push({ after: children[i - 1], before: children[i], gap })
}
const totalGap = gaps.reduce((a, g) => a + g.gap, 0)

const totalLlmOnly = sessions.reduce((a, s) => a + s.llmOnlyMs, 0)
const totalTool = sessions.reduce((a, s) => a + s.toolMs, 0)
const totalIn = sessions.reduce((a, s) => a + s.tokens.input, 0)
const totalOut = sessions.reduce((a, s) => a + s.tokens.output, 0)
const totalReason = sessions.reduce((a, s) => a + s.tokens.reasoning, 0)
const totalCache = sessions.reduce((a, s) => a + s.tokens.cacheRead, 0)

console.log(`\n## 汇总`)
console.log(`- 纯 LLM 生成耗时合计: ${fmtMs(totalLlmOnly)}（并行会话会重复计入；子代理墙钟并集 ${fmtMs(childWall)}）`)
console.log(`- 全部工具耗时合计: ${fmtMs(totalTool)}`)
console.log(`- tokens: input=${fmtK(totalIn)} output=${fmtK(totalOut)} reasoning=${fmtK(totalReason)} cache_read=${fmtK(totalCache)}`)
console.log(`- reasoning 占输出比: ${pct(totalReason, totalOut + totalReason)}；cache_read 占总输入比: ${pct(totalCache, totalIn + totalCache)}`)
const modelBreakdown = new Map()
for (const s of sessions) for (const m of s.models) modelBreakdown.set(m, (modelBreakdown.get(m) ?? 0) + s.llmOnlyMs)
if (modelBreakdown.size > 1) {
  console.log(`- 模型分布: ` + [...modelBreakdown.entries()].map(([m, ms]) => `${m}: ${fmtMs(ms)}`).join(", "))
}

// 主理人（根会话）分解：task 工具等待 vs bash 台账 vs 自身纯 LLM 回合
const lead = sessions.find((s) => s.depth === 0)
if (lead) {
  const taskWait = lead.tools.filter((t) => t.tool === "task").reduce((a, t) => a + (t.duration ?? 0), 0)
  const bashMs = lead.tools.filter((t) => t.tool === "bash").reduce((a, t) => a + (t.duration ?? 0), 0)
  const taskCount = lead.tools.filter((t) => t.tool === "task").length
  const bashCount = lead.tools.filter((t) => t.tool === "bash").length
  console.log(`\n## 主理人（${lead.agent}）分解  墙钟 ${fmtMs(lead.wall)}`)
  console.log(`- 自身纯 LLM 生成: ${lead.turns} 回合 / ${fmtMs(lead.llmOnlyMs)}（${pct(lead.llmOnlyMs, lead.wall)}）`)
  console.log(`- task 调度等待: ${taskCount} 次 / ${fmtMs(taskWait)}（${pct(taskWait, lead.wall)}）`)
  console.log(`- bash（台账/脚本）: ${bashCount} 次 / ${fmtMs(bashMs)}（${pct(bashMs, lead.wall)}）`)
  const other = lead.wall - lead.llmOnlyMs - taskWait - bashMs
  console.log(`- 其他/间隙: ${fmtMs(Math.max(0, other))}`)
  if (Object.keys(lead.byTool).length > 0) {
    console.log(`- 工具明细: ` + Object.entries(lead.byTool).map(([k, v]) => `${k}×${v.count} ${fmtMs(v.ms)}`).join(", "))
  }
}

if (gaps.length > 0) {
  console.log(`\n## 调度间隙（子代理结束 → 下一个子代理开始，主理人中转耗时）`)
  console.log(`合计 ${fmtMs(totalGap)}（占墙钟 ${pct(totalGap, wallTotal)}）；>30s 的间隙：`)
  for (const g of gaps.filter((x) => x.gap > 30_000)) {
    console.log(`- ${fmtMs(g.gap)}  ${g.after.agent} → ${g.before.agent}`)
  }
}

if (trace) {
  console.log(`\n## DAG 节点台账（00-execution-trace.json）`)
  console.log(`| 节点 | agent | 事件 | 耗时 | 备注 |`)
  console.log(`|---|---|---|---|---|`)
  for (const e of trace) {
    console.log(`| ${e.node} | ${e.agent ?? ""} | ${e.event} | ${e.durationMs !== undefined ? fmtMs(e.durationMs) : ""} | ${e.batch ?? ""} |`)
  }
}

console.log("")
