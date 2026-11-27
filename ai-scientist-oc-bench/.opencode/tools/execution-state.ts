import { tool } from "@opencode-ai/plugin"
import z from "zod"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"

const statusValues = ["\u5f85\u6267\u884c", "\u8fd0\u884c\u4e2d", "\u5df2\u6210\u529f", "\u5df2\u5931\u8d25", "\u5df2\u963b\u585e", "\u5df2\u4e2d\u65ad", "\u5916\u90e8\u72b6\u6001\u672a\u77e5", "\u5df2\u53d6\u6d88"] as const
type NodeStatus = (typeof statusValues)[number]

const taskNode = z.object({
  task_id: z.string().min(1),
  expert: z.string().min(1),
  dependencies: z.array(z.string().min(1)).default([]),
  outputs: z.array(z.string().min(1)).default([]),
  human_gates: z.array(z.string().min(1)).default([]),
})

type ExecutionNode = {
  "\u4efb\u52a1ID": string
  "\u4e13\u5bb6": string
  "\u4f9d\u8d56": string[]
  "\u8f93\u51fa": string[]
  "\u4eba\u5de5\u95f8\u95e8": string[]
  "\u72b6\u6001": NodeStatus
  "\u5c1d\u8bd5\u6b21\u6570": number
  "\u66f4\u65b0\u65f6\u95f4": string
  "\u5f00\u59cb\u65f6\u95f4"?: string
  "\u5b8c\u6210\u65f6\u95f4"?: string
  "\u5fc3\u8df3\u65f6\u95f4"?: string
  "\u5916\u90e8\u4efb\u52a1ID"?: string
  "\u5931\u8d25\u539f\u56e0"?: string
  "\u8f93\u51fa\u6821\u9a8c"?: Array<Record<string, unknown>>
}

type ExecutionState = {
  "\u8fd0\u884cID": string
  "\u7248\u672c": "1.0"
  "\u66f4\u65b0\u65f6\u95f4": string
  "\u8282\u70b9": Record<string, ExecutionNode>
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

function resolveWorkspace(workspace: string) {
  return path.isAbsolute(workspace) ? path.resolve(workspace) : path.resolve(projectRoot, workspace)
}

function statePath(workspace: string) {
  const root = resolveWorkspace(workspace)
  return { root, target: path.join(root, "09-execution-state.json") }
}

function load(workspace: string): { root: string; target: string; state: ExecutionState } {
  const { root, target } = statePath(workspace)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("workspace does not exist or is not a directory")
  if (!fs.existsSync(target)) throw new Error("execution state does not exist; run initialize first")
  const state = JSON.parse(fs.readFileSync(target, "utf8")) as ExecutionState
  if (state["\u7248\u672c"] !== "1.0" || !state["\u8282\u70b9"] || typeof state["\u8282\u70b9"] !== "object") throw new Error("execution state has an unsupported format")
  return { root, target, state }
}

function save(target: string, state: ExecutionState) {
  state["\u66f4\u65b0\u65f6\u95f4"] = new Date().toISOString()
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8")
  try {
    fs.renameSync(tmp, target)
  } catch {
    fs.copyFileSync(tmp, target)
    fs.unlinkSync(tmp)
  }
}

function requireNode(state: ExecutionState, taskId?: string) {
  if (!taskId) throw new Error("operation requires task_id")
  const node = state["\u8282\u70b9"][taskId]
  if (!node) throw new Error(`task_id was not found: ${taskId}`)
  return node
}

function dependencyProblems(state: ExecutionState, node: ExecutionNode) {
  return node["\u4f9d\u8d56"].filter((dep) => state["\u8282\u70b9"][dep]?.["\u72b6\u6001"] !== "\u5df2\u6210\u529f")
}

function verifyArtifact(root: string, relative: string) {
  const target = path.resolve(root, relative)
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`${relative}: path is outside the workspace`)
  if (!fs.existsSync(target)) throw new Error(`${relative}: output artifact does not exist`)
  const stat = fs.statSync(target)
  if (stat.isFile()) {
    const content = fs.readFileSync(target)
    return { "\u8def\u5f84": relative, "sha256": crypto.createHash("sha256").update(content).digest("hex"), "\u5b57\u8282\u6570": content.byteLength, "\u7c7b\u578b": "\u6587\u4ef6" }
  }
  if (!stat.isDirectory()) throw new Error(`${relative}: output artifact is neither a file nor a directory`)
  const files: Array<{ path: string; sha256: string; bytes: number }> = []
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(entryPath)
      else if (entry.isFile()) {
        const content = fs.readFileSync(entryPath)
        files.push({ path: path.relative(target, entryPath), sha256: crypto.createHash("sha256").update(content).digest("hex"), bytes: content.byteLength })
      }
    }
  }
  visit(target)
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { "\u8def\u5f84": relative, "sha256": crypto.createHash("sha256").update(JSON.stringify(files)).digest("hex"), "\u5b57\u8282\u6570": files.reduce((total, file) => total + file.bytes, 0), "\u7c7b\u578b": "\u76ee\u5f55", "\u6587\u4ef6\u6570": files.length }
}

function summary(state: ExecutionState) {
  const counts: Record<string, number> = {}
  for (const node of Object.values(state["\u8282\u70b9"])) counts[node["\u72b6\u6001"]] = (counts[node["\u72b6\u6001"]] ?? 0) + 1
  return counts
}

function recoverState(state: ExecutionState, staleAfterMinutes: number) {
  const now = Date.now()
  const staleAfterMs = staleAfterMinutes * 60 * 1000
  const interrupted: string[] = []
  const externalUnknown: string[] = []
  for (const node of Object.values(state["\u8282\u70b9"])) {
    if (node["\u72b6\u6001"] !== "\u8fd0\u884c\u4e2d") continue
    const last = Date.parse(node["\u5fc3\u8df3\u65f6\u95f4"] ?? node["\u66f4\u65b0\u65f6\u95f4"])
    if (Number.isFinite(last) && now - last <= staleAfterMs) continue
    node["\u72b6\u6001"] = node["\u5916\u90e8\u4efb\u52a1ID"] ? "\u5916\u90e8\u72b6\u6001\u672a\u77e5" : "\u5df2\u4e2d\u65ad"
    node["\u66f4\u65b0\u65f6\u95f4"] = new Date().toISOString()
    if (node["\u72b6\u6001"] === "\u5916\u90e8\u72b6\u6001\u672a\u77e5") externalUnknown.push(node["\u4efb\u52a1ID"])
    else interrupted.push(node["\u4efb\u52a1ID"])
  }
  const ready: string[] = []
  const blockedByDependencies: Record<string, string[]> = {}
  for (const node of Object.values(state["\u8282\u70b9"])) {
    if (!["\u5f85\u6267\u884c", "\u5df2\u4e2d\u65ad", "\u5df2\u5931\u8d25"].includes(node["\u72b6\u6001"])) continue
    const missing = dependencyProblems(state, node)
    if (missing.length) blockedByDependencies[node["\u4efb\u52a1ID"]] = missing
    else ready.push(node["\u4efb\u52a1ID"])
  }
  return { interrupted, externalUnknown, ready, blockedByDependencies }
}

export default tool({
  description: "Persist and recover per-node execution state for an AI Scientist research workspace.",
  args: {
    workspace: z.string(),
    operation: z.enum(["initialize", "start", "heartbeat", "complete", "fail", "block", "recover"]),
    task_nodes: z.array(taskNode).default([]),
    task_id: z.string().min(1).optional(),
    output_artifacts: z.array(z.string().min(1)).default([]),
    failure_reason: z.string().min(1).optional(),
    external_job_id: z.string().min(1).optional(),
    stale_after_minutes: z.number().int().positive().default(30),
  },
  async execute(args) {
    if (args.operation === "initialize") {
      if (!args.task_nodes.length) throw new Error("initialize requires at least one task node")
      const { root, target } = statePath(args.workspace)
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("workspace does not exist or is not a directory")
      if (fs.existsSync(target)) {
        const { state } = load(args.workspace)
        return JSON.stringify({ "\u72b6\u6001": "\u5df2\u5b58\u5728", "\u8def\u5f84": target, "\u6982\u89c8": summary(state) }, null, 2)
      }
      const ids = new Set<string>()
      for (const node of args.task_nodes) {
        if (ids.has(node.task_id)) throw new Error(`duplicate task_id: ${node.task_id}`)
        ids.add(node.task_id)
      }
      for (const node of args.task_nodes) {
        for (const dep of node.dependencies) if (!ids.has(dep)) throw new Error(`${node.task_id}: unknown dependency ${dep}`)
      }
      const now = new Date().toISOString()
      const state: ExecutionState = { "\u8fd0\u884cID": path.basename(root), "\u7248\u672c": "1.0", "\u66f4\u65b0\u65f6\u95f4": now, "\u8282\u70b9": {} }
      for (const item of args.task_nodes) {
        state["\u8282\u70b9"][item.task_id] = { "\u4efb\u52a1ID": item.task_id, "\u4e13\u5bb6": item.expert, "\u4f9d\u8d56": item.dependencies, "\u8f93\u51fa": item.outputs, "\u4eba\u5de5\u95f8\u95e8": item.human_gates, "\u72b6\u6001": "\u5f85\u6267\u884c", "\u5c1d\u8bd5\u6b21\u6570": 0, "\u66f4\u65b0\u65f6\u95f4": now }
      }
      save(target, state)
      return JSON.stringify({ "\u72b6\u6001": "\u5df2\u521d\u59cb\u5316", "\u8def\u5f84": target, "\u6982\u89c8": summary(state) }, null, 2)
    }

    const { root, target, state } = load(args.workspace)
    if (args.operation === "recover") {
      const result = recoverState(state, args.stale_after_minutes)
      save(target, state)
      return JSON.stringify({ "\u72b6\u6001": "\u5df2\u6062\u590d\u68c0\u67e5", "\u8def\u5f84": target, "\u6062\u590d": result, "\u6982\u89c8": summary(state) }, null, 2)
    }

    const node = requireNode(state, args.task_id)
    const now = new Date().toISOString()
    if (args.operation === "start") {
      if (!["\u5f85\u6267\u884c", "\u5df2\u4e2d\u65ad", "\u5df2\u5931\u8d25"].includes(node["\u72b6\u6001"])) throw new Error(`task cannot start from status ${node["\u72b6\u6001"]}`)
      const missing = dependencyProblems(state, node)
      if (missing.length) throw new Error(`task dependencies are not successful: ${missing.join(", ")}`)
      node["\u72b6\u6001"] = "\u8fd0\u884c\u4e2d"
      node["\u5c1d\u8bd5\u6b21\u6570"] += 1
      node["\u5f00\u59cb\u65f6\u95f4"] = now
      node["\u5fc3\u8df3\u65f6\u95f4"] = now
      if (args.external_job_id) node["\u5916\u90e8\u4efb\u52a1ID"] = args.external_job_id
    } else if (args.operation === "heartbeat") {
      if (node["\u72b6\u6001"] !== "\u8fd0\u884c\u4e2d") throw new Error("heartbeat requires a running task")
      node["\u5fc3\u8df3\u65f6\u95f4"] = now
    } else if (args.operation === "complete") {
      if (node["\u72b6\u6001"] !== "\u8fd0\u884c\u4e2d") throw new Error("complete requires a running task")
      const artifacts = args.output_artifacts.length ? args.output_artifacts : node["\u8f93\u51fa"]
      if (!artifacts.length) throw new Error("complete requires declared outputs or output_artifacts")
      const verifiedArtifacts = artifacts.map((relative) => verifyArtifact(root, relative))
      node["\u72b6\u6001"] = "\u5df2\u6210\u529f"
      node["\u5b8c\u6210\u65f6\u95f4"] = now
      node["\u8f93\u51fa\u6821\u9a8c"] = verifiedArtifacts
    } else if (args.operation === "fail") {
      if (!args.failure_reason) throw new Error("fail requires failure_reason")
      node["\u72b6\u6001"] = "\u5df2\u5931\u8d25"
      node["\u5931\u8d25\u539f\u56e0"] = args.failure_reason
    } else if (args.operation === "block") {
      if (!args.failure_reason) throw new Error("block requires failure_reason")
      node["\u72b6\u6001"] = "\u5df2\u963b\u585e"
      node["\u5931\u8d25\u539f\u56e0"] = args.failure_reason
    }
    node["\u66f4\u65b0\u65f6\u95f4"] = now
    save(target, state)
    return JSON.stringify({ "\u72b6\u6001": node["\u72b6\u6001"], "\u4efb\u52a1ID": node["\u4efb\u52a1ID"], "\u8def\u5f84": target, "\u6982\u89c8": summary(state) }, null, 2)
  },
})
