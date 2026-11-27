import { tool } from "@opencode-ai/plugin"
import z from "zod"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const categories = ["\u5047\u8bbe\u88ab\u5426\u5b9a", "\u5b9e\u9a8c\u5931\u8d25", "\u5b9e\u73b0\u6216\u73af\u5883\u5931\u8d25", "\u8bc1\u636e\u88ab\u64a4\u9500", "\u5ba1\u67e5\u5426\u51b3", "\u5176\u4ed6"] as const
const statuses = ["\u5f85\u5ba1\u67e5", "\u5df2\u6fc0\u6d3b", "\u5df2\u62d2\u7edd", "\u5df2\u64a4\u9500", "\u5df2\u8fc7\u671f"] as const
type Status = (typeof statuses)[number]
type Memory = Record<string, unknown> & { "\u8bb0\u5fc6ID": string; "\u72b6\u6001": Status; "\u5339\u914d\u6807\u7b7e": string[]; "\u8bc1\u636e\u4ea7\u7269": string[]; "\u5ba1\u67e5\u5386\u53f2": Array<Record<string, string>> }
type Ledger = { "\u8fd0\u884cID": string; "\u7248\u672c": "1.0"; "\u8bb0\u5fc6": Memory[] }

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

function resolveWorkspace(workspace: string) {
  return path.isAbsolute(workspace) ? path.resolve(workspace) : path.resolve(projectRoot, workspace)
}

function load(workspace: string) {
  const root = resolveWorkspace(workspace)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("workspace does not exist or is not a directory")
  const target = path.join(root, "10-failure-memory.json")
  if (!fs.existsSync(target)) return { root, target, ledger: { "\u8fd0\u884cID": path.basename(root), "\u7248\u672c": "1.0", "\u8bb0\u5fc6": [] } as Ledger }
  const ledger = JSON.parse(fs.readFileSync(target, "utf8")) as Ledger & { "失败经验账本"?: Memory[] }
  if (!Array.isArray(ledger["记忆"]) && Array.isArray(ledger["失败经验账本"])) {
    ledger["记忆"] = ledger["失败经验账本"]
    delete ledger["失败经验账本"]
  }
  if (ledger["\u7248\u672c"] !== "1.0" || !Array.isArray(ledger["\u8bb0\u5fc6"])) throw new Error("failure memory has an unsupported format")
  return { root, target, ledger }
}

function save(target: string, ledger: Ledger) { fs.writeFileSync(target, JSON.stringify(ledger, null, 2) + "\n", "utf8") }
function verifyEvidence(root: string, evidence: string[]) {
  for (const relative of evidence) {
    const target = path.resolve(root, relative)
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`evidence artifact is unavailable: ${relative}`)
  }
}

export default tool({
  description: "Record, independently review, revoke, and retrieve scoped research failure lessons without treating unreviewed observations as rules.",
  args: {
    workspace: z.string(),
    operation: z.enum(["record", "review", "query"]),
    category: z.enum(categories).optional(),
    summary: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).default([]),
    evidence_artifacts: z.array(z.string().min(1)).default([]),
    context_record_id: z.string().min(1).optional(),
    task_id: z.string().min(1).optional(),
    applicability: z.string().min(1).optional(),
    exclusions: z.string().min(1).optional(),
    suspected_cause: z.string().min(1).optional(),
    confidence: z.enum(["\u4f4e", "\u4e2d", "\u9ad8"]).optional(),
    prevention: z.string().min(1).optional(),
    alternative: z.string().min(1).optional(),
    memory_id: z.string().min(1).optional(),
    review_outcome: z.enum(["\u5df2\u6fc0\u6d3b", "\u5df2\u62d2\u7edd", "\u5df2\u64a4\u9500", "\u5df2\u8fc7\u671f"]).optional(),
    review_reason: z.string().min(1).optional(),
  },
  async execute(args) {
    const { root, target, ledger } = load(args.workspace)
    if (args.operation === "record") {
      if (!args.category || !args.summary || !args.tags.length || !args.evidence_artifacts.length || !args.applicability) throw new Error("record requires category, summary, tags, evidence_artifacts, and applicability")
      verifyEvidence(root, args.evidence_artifacts)
      const memoryId = `failure-${Date.now()}-${ledger["\u8bb0\u5fc6"].length + 1}`
      ledger["\u8bb0\u5fc6"].push({ "\u8bb0\u5fc6ID": memoryId, "\u72b6\u6001": "\u5f85\u5ba1\u67e5", "\u7c7b\u578b": args.category, "\u6458\u8981": args.summary, "\u5339\u914d\u6807\u7b7e": args.tags, "\u8bc1\u636e\u4ea7\u7269": args.evidence_artifacts, ...(args.context_record_id ? { "\u8c03\u7528\u8bb0\u5f55ID": args.context_record_id } : {}), ...(args.task_id ? { "\u4efb\u52a1ID": args.task_id } : {}), "\u9002\u7528\u8303\u56f4": args.applicability, ...(args.exclusions ? { "\u4e0d\u9002\u7528\u6761\u4ef6": args.exclusions } : {}), ...(args.suspected_cause ? { "\u6839\u56e0\u5047\u8bbe": args.suspected_cause } : {}), ...(args.confidence ? { "\u7f6e\u4fe1\u5ea6": args.confidence } : {}), "\u521b\u5efa\u65f6\u95f4": new Date().toISOString(), "\u5ba1\u67e5\u5386\u53f2": [] })
      save(target, ledger)
      return JSON.stringify({ "\u72b6\u6001": "\u5f85\u5ba1\u67e5", "\u8bb0\u5fc6ID": memoryId, "\u8def\u5f84": target }, null, 2)
    }
    if (args.operation === "review") {
      if (!args.memory_id || !args.review_outcome || !args.review_reason) throw new Error("review requires memory_id, review_outcome, and review_reason")
      const memory = ledger["\u8bb0\u5fc6"].find((item) => item["\u8bb0\u5fc6ID"] === args.memory_id)
      if (!memory) throw new Error("memory_id was not found")
      if (memory["\u72b6\u6001"] !== "\u5f85\u5ba1\u67e5" && args.review_outcome === "\u5df2\u6fc0\u6d3b") throw new Error("only pending memories can be activated")
      if (args.review_outcome === "\u5df2\u6fc0\u6d3b") {
        if (!args.prevention) throw new Error("activation requires a prevention rule")
        verifyEvidence(root, memory["\u8bc1\u636e\u4ea7\u7269"])
        memory["\u9632\u91cd\u7b56\u7565"] = args.prevention
        if (args.alternative) memory["\u66ff\u4ee3\u8def\u7ebf"] = args.alternative
      }
      memory["\u72b6\u6001"] = args.review_outcome
      memory["\u5ba1\u67e5\u5386\u53f2"].push({ "\u65f6\u95f4": new Date().toISOString(), "\u7ed3\u8bba": args.review_outcome, "\u7406\u7531": args.review_reason })
      save(target, ledger)
      return JSON.stringify({ "\u72b6\u6001": memory["\u72b6\u6001"], "\u8bb0\u5fc6ID": args.memory_id, "\u8def\u5f84": target }, null, 2)
    }
    if (!args.tags.length) throw new Error("query requires at least one tag")
    const tags = new Set(args.tags.map((tag) => tag.toLowerCase()))
    const matches = ledger["\u8bb0\u5fc6"].filter((memory) => memory["\u72b6\u6001"] === "\u5df2\u6fc0\u6d3b" && memory["\u5339\u914d\u6807\u7b7e"].some((tag) => tags.has(tag.toLowerCase())))
    return JSON.stringify({ "\u72b6\u6001": "\u5df2\u68c0\u7d22", "\u67e5\u8be2\u6807\u7b7e": args.tags, "\u547d\u4e2d": matches.map((memory) => ({ "\u8bb0\u5fc6ID": memory["\u8bb0\u5fc6ID"], "\u6458\u8981": memory["\u6458\u8981"], "\u9002\u7528\u8303\u56f4": memory["\u9002\u7528\u8303\u56f4"], "\u4e0d\u9002\u7528\u6761\u4ef6": memory["\u4e0d\u9002\u7528\u6761\u4ef6"], "\u9632\u91cd\u7b56\u7565": memory["\u9632\u91cd\u7b56\u7565"], "\u66ff\u4ee3\u8def\u7ebf": memory["\u66ff\u4ee3\u8def\u7ebf"] })) }, null, 2)
  },
})
