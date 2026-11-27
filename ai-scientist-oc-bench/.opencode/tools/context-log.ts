import { tool } from "@opencode-ai/plugin"
import z from "zod"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const contextItem = z.object({ context_id: z.string().min(1), type: z.string().min(1), source_path: z.string().min(1).optional(), purpose: z.string().min(1), evidence_status: z.enum(["\u5df2\u9a8c\u8bc1", "\u90e8\u5206\u652f\u6301", "\u5f85\u6838\u9a8c", "\u4e0d\u9002\u7528"]), selection: z.enum(["\u5f3a\u5236", "\u8ba1\u5212", "\u68c0\u7d22", "\u4eba\u5de5\u6307\u5b9a"]) })
const skillItem = z.object({ name: z.string().min(1), purpose: z.string().min(1) })
type ContextLog = { [key: string]: unknown; "\u8fd0\u884cID": string; "\u7248\u672c": "1.0"; "\u8bb0\u5f55": Array<Record<string, any>> }

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

function resolveWorkspace(workspace: string) {
  return path.isAbsolute(workspace) ? path.resolve(workspace) : path.resolve(projectRoot, workspace)
}

function load(workspace: string): { target: string; log: ContextLog } {
  const root = resolveWorkspace(workspace)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("workspace does not exist or is not a directory")
  const target = path.join(root, "08-context-invocation-log.json")
  if (!fs.existsSync(target)) return { target, log: { "\u8fd0\u884cID": path.basename(root), "\u7248\u672c": "1.0", "\u8bb0\u5f55": [] } }
  const log = JSON.parse(fs.readFileSync(target, "utf8")) as ContextLog
  if (log["\u7248\u672c"] !== "1.0" || !Array.isArray(log["\u8bb0\u5f55"])) throw new Error("context log has an unsupported format")
  return { target, log }
}

function save(target: string, log: ContextLog) { fs.writeFileSync(target, JSON.stringify(log, null, 2) + "\n", "utf8") }

export default tool({
  description: "Create and complete auditable per-stage context invocation records in a research workspace.",
  args: {
    workspace: z.string(),
    operation: z.enum(["start", "complete"]),
    phase: z.string().min(1).optional(),
    cycle_step: z.enum(["Gather", "Act", "Verify", "Adjust"]).optional(),
    trigger: z.string().min(1).optional(),
    task_nodes: z.array(z.string().min(1)).default([]),
    agents: z.array(z.string().min(1)).default([]),
    skills: z.array(skillItem).default([]),
    contexts: z.array(contextItem).default([]),
    decision_basis: z.string().min(1).optional(),
    record_id: z.string().min(1).optional(),
    validation_result: z.string().min(1).optional(),
    output_artifacts: z.array(z.string().min(1)).default([]),
    adjustment: z.string().min(1).optional(),
    aborted: z.boolean().default(false),
  },
  async execute(args) {
    const { target, log } = load(args.workspace)
    if (args.operation === "start") {
      if (!args.phase || !args.cycle_step || !args.trigger || args.contexts.length === 0) throw new Error("start requires phase, cycle_step, trigger, and at least one context")
      const recordId = "ctx-" + Date.now() + "-" + (log["\u8bb0\u5f55"].length + 1)
      log["\u8bb0\u5f55"].push({ "\u8bb0\u5f55ID": recordId, "\u9636\u6bb5": args.phase, "\u5faa\u73af\u73af\u8282": args.cycle_step, "\u89e6\u53d1\u4e8b\u4ef6": args.trigger, "\u521b\u5efa\u65f6\u95f4": new Date().toISOString(), "\u72b6\u6001": "\u8fdb\u884c\u4e2d", "\u4efb\u52a1\u8282\u70b9": args.task_nodes, "\u8c03\u7528\u4e13\u5bb6": args.agents, "\u8c03\u7528Skill": args.skills.map((skill) => ({ "\u6280\u80fd": skill.name, "\u7528\u9014": skill.purpose })), "\u8c03\u7528\u4e0a\u4e0b\u6587": args.contexts.map((context) => ({ "\u4e0a\u4e0b\u6587ID": context.context_id, "\u7c7b\u578b": context.type, ...(context.source_path ? { "\u6765\u6e90\u8def\u5f84": context.source_path } : {}), "\u7528\u9014": context.purpose, "\u8bc1\u636e\u72b6\u6001": context.evidence_status, "\u9009\u62e9\u65b9\u5f0f": context.selection })), ...(args.decision_basis ? { "\u51b3\u7b56\u4f9d\u636e": args.decision_basis } : {}) })
      save(target, log)
      return JSON.stringify({ "\u72b6\u6001": "\u5df2\u8bb0\u5f55", "\u8bb0\u5f55ID": recordId, "\u8def\u5f84": target }, null, 2)
    }
    if (!args.record_id) throw new Error("complete requires record_id")
    const record = log["\u8bb0\u5f55"].find((item) => item["\u8bb0\u5f55ID"] === args.record_id)
    if (!record) throw new Error("record_id was not found")
    if (record["\u72b6\u6001"] !== "\u8fdb\u884c\u4e2d") throw new Error("record is already complete")
    record["\u72b6\u6001"] = args.aborted ? "\u5df2\u4e2d\u6b62" : "\u5df2\u5b8c\u6210"
    record["\u5b8c\u6210\u65f6\u95f4"] = new Date().toISOString()
    if (args.validation_result) record["\u9a8c\u8bc1\u7ed3\u679c"] = args.validation_result
    if (args.output_artifacts.length) record["\u8f93\u51fa\u4ea7\u7269"] = args.output_artifacts
    if (args.adjustment) record["\u8c03\u6574"] = args.adjustment
    save(target, log)
    return JSON.stringify({ "\u72b6\u6001": record["\u72b6\u6001"], "\u8bb0\u5f55ID": args.record_id, "\u8def\u5f84": target }, null, 2)
  },
})
