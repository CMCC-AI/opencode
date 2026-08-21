import type { FileNode } from "@opencode-ai/sdk/v2"

const ARTIFACT_LIMIT = 200
const ARTIFACT_MAX_DEPTH = 8
const ARTIFACT_DIRS = new Set([
  "artifact",
  "artifacts",
  "deliverable",
  "deliverables",
  "output",
  "outputs",
  "report",
  "reports",
])
const ARTIFACT_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "htm",
  "html",
  "jpeg",
  "jpg",
  "json",
  "md",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "svg",
  "txt",
  "xls",
  "xlsx",
])

function normalizeSeparators(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "")
}

function normalizeRelativePath(value: string) {
  const normalized = normalizeSeparators(value).replace(/^\/+/, "")
  if (normalized.split("/").includes("..")) return ""
  return normalized
}

function fileName(value: string) {
  return normalizeSeparators(value).split("/").filter(Boolean).at(-1) ?? value
}

function nodePath(root: string, value: string) {
  const normalized = normalizeRelativePath(value)
  if (!root || normalized === root || normalized.startsWith(`${root}/`)) return normalized
  return `${root}/${normalized}`
}

function isArtifactFile(value: string) {
  const extension = fileName(value).split(".").at(-1)?.toLowerCase()
  return extension ? ARTIFACT_EXTENSIONS.has(extension) : false
}

function isArtifactDirectory(value: string) {
  return ARTIFACT_DIRS.has(fileName(value).toLowerCase())
}

export function cmccWorkspaceRelativePath(directory: string, value: string) {
  const root = normalizeSeparators(directory)
  const target = normalizeSeparators(value)
  if (target === root) return ""
  if (target.startsWith(`${root}/`)) return target.slice(root.length + 1)
  return undefined
}

export function cmccScopedArtifactPath(directory: string, root: string | undefined, value: string) {
  const normalized = normalizeSeparators(value).replace(/^file:\/\//, "")
  const absolute = normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)
  const relative = absolute ? cmccWorkspaceRelativePath(directory, normalized) : normalizeRelativePath(normalized)
  if (!relative) return
  if (!root) return relative
  if (relative === root || relative.startsWith(`${root}/`)) return relative
}

export async function cmccScanWorkspaceArtifactPaths(
  list: (path: string) => Promise<FileNode[]>,
  roots: string[] = [],
  dedicatedRoot = false,
) {
  const paths = new Set<string>()
  const queue: { path: string; depth: number }[] = []
  const normalizedRoots = roots.map(normalizeRelativePath).filter(Boolean)
  const startingRoots = dedicatedRoot ? normalizedRoots : ["", ...normalizedRoots]

  for (const root of new Set(startingRoots)) {
    const nodes = await list(root)
    for (const node of nodes) {
      const current = nodePath(root, node.path)
      if (!current) continue

      if (node.type === "file" && isArtifactFile(current)) paths.add(current)
      if (node.type === "directory" && (dedicatedRoot || isArtifactDirectory(current))) {
        queue.push({ path: current, depth: 1 })
      }
      if (paths.size >= ARTIFACT_LIMIT) break
    }
    if (paths.size >= ARTIFACT_LIMIT) break
  }

  while (queue.length > 0 && paths.size < ARTIFACT_LIMIT) {
    const current = queue.shift()
    if (!current) continue

    const children = await list(current.path)
    for (const child of children) {
      const childPath = nodePath(current.path, child.path)
      if (!childPath) continue

      if (child.type === "file") paths.add(childPath)
      if (child.type === "directory" && current.depth < ARTIFACT_MAX_DEPTH) {
        queue.push({ path: childPath, depth: current.depth + 1 })
      }
      if (paths.size >= ARTIFACT_LIMIT) break
    }
  }

  return [...paths].sort((a, b) => a.localeCompare(b))
}
