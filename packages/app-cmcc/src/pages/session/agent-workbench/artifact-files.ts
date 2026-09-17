import type { FileNode } from "@opencode-ai/sdk/v2"
import { cmccArtifactDirectory } from "@/utils/cmcc-workspace"
import { cmccWorkspaceRelativePath } from "@/utils/cmcc-artifact-paths"
import type { AgentWorkbench, SessionArtifact } from "./model"

const FILE_LIMIT = 200
const DIRECTORY_LIMIT = 200
const MAX_DEPTH = 8

export function workbenchFiles(workbench: AgentWorkbench) {
  return workbench.fileArtifacts ?? workbench.artifacts
}

export function sessionArtifactRoot(directory: string, metadata: unknown) {
  const absolute = cmccArtifactDirectory(metadata, directory)
  return absolute ? cmccWorkspaceRelativePath(directory, absolute) : undefined
}

export async function scanSessionArtifactFiles(input: {
  directory: string
  root: string
  list: (path: string) => Promise<FileNode[]>
  isCurrent?: () => boolean
  legacyResearch?: boolean
}) {
  const safeRoot = safeRelative(input.root)
  if (
    !safeRoot?.startsWith("runs/") &&
    !(input.legacyResearch && /^tmp\/research-workspace\/\d{8}-\d{4}$/.test(safeRoot ?? ""))
  )
    throw new Error("缺少有效的会话产物目录")
  const paths = new Set<string>()
  const visited = new Set<string>()
  const queue = [{ path: input.root, depth: 0 }]
  const warnings = new Set<string>()
  while (queue.length && paths.size < FILE_LIMIT && visited.size < DIRECTORY_LIMIT) {
    if (input.isCurrent && !input.isCurrent()) return { paths: [], warnings: [] }
    const current = queue.shift()!
    if (visited.has(current.path)) continue
    visited.add(current.path)
    let nodes: FileNode[]
    try {
      nodes = await input.list(current.path)
    } catch (error) {
      if (current.path === input.root) throw error
      warnings.add(`目录读取失败：${current.path}`)
      continue
    }
    for (const node of nodes) {
      const path = listedPath(input.directory, current.path, node.path)
      if (!path || !path.startsWith(`${input.root}/`)) {
        warnings.add("文件接口返回了不属于当前产物目录的路径，已忽略")
        continue
      }
      if (node.type === "file") paths.add(path)
      if (node.type === "directory") {
        if (current.depth < MAX_DEPTH) queue.push({ path, depth: current.depth + 1 })
        else warnings.add(`文件目录超过 ${MAX_DEPTH} 层，部分文件未展示`)
      }
      if (paths.size >= FILE_LIMIT) break
    }
  }
  if (paths.size >= FILE_LIMIT) warnings.add(`文件清单达到 ${FILE_LIMIT} 个文件上限，可能未完全展示`)
  if (queue.length && visited.size >= DIRECTORY_LIMIT) warnings.add(`文件清单达到 ${DIRECTORY_LIMIT} 个目录扫描上限`)
  return { paths: [...paths].sort((a, b) => a.localeCompare(b)), warnings: [...warnings] }
}

export function mergeSessionArtifactFiles(input: {
  artifacts: readonly SessionArtifact[]
  paths: readonly string[]
  rootSessionId: string
}) {
  const files = new Map(input.artifacts.map((artifact) => [artifact.path, artifact]))
  for (const path of input.paths) {
    if (files.has(path)) continue
    files.set(path, {
      path,
      filename: path.split("/").at(-1)!,
      ownerAgentId: "",
      ownerSessionId: input.rootSessionId,
      messageId: "",
      partId: "",
      role: "supporting",
    })
  }
  return [...files.values()]
}

function safeRelative(path: string) {
  const value = path.replaceAll("\\", "/").replace(/\/+$/, "")
  if (!value || value.startsWith("/") || /^[A-Za-z]:/.test(value) || value.includes("\0")) return undefined
  if (value.split("/").some((part) => !part || part === "." || part === "..")) return undefined
  return value
}

function listedPath(directory: string, parent: string, path: string) {
  const normalized = path.replaceAll("\\", "/")
  const absolute = normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)
  const relative = absolute ? cmccWorkspaceRelativePath(directory, normalized) : normalized
  const value = relative ? safeRelative(relative) : undefined
  if (!value) return undefined
  const full = value.includes("/") ? value : `${parent}/${value}`
  // Directory listings contain immediate children, never siblings or another run.
  if (full.slice(0, full.lastIndexOf("/")) !== parent) return undefined
  return full
}
