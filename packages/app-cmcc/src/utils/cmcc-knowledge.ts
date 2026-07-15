export type KnowledgeNotebook = {
  id: string
  name: string
  description: string
  emoji: string
  directory: string
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  sessionID?: string
  sessionIDs?: string[]
  sourceCount?: number
}

export type KnowledgeSession = {
  id: string
  directory: string
  metadata?: Record<string, unknown>
}

export type KnowledgeGraphNode = {
  id: string
  path: string
  label: string
  degree: number
  inDegree: number
  outDegree: number
  x: number
  y: number
}

export type KnowledgeGraphEdge = {
  id: string
  source: string
  target: string
}

export type KnowledgeGraph = {
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
}

export const CMCC_KNOWLEDGE_STORAGE_KEY = "opencode.cmcc.knowledge.notebooks.v1"

type KnowledgeStorage = Pick<Storage, "getItem" | "setItem">

export function cmccKnowledgeRoot(home: string) {
  return joinPath(home, "Documents", "DeepInsight", "Knowledge")
}

export function cmccKnowledgeDirectory(home: string, name: string, id: string) {
  return joinPath(cmccKnowledgeRoot(home), `${slug(name)}-${id.slice(0, 8)}`)
}

export function cmccKnowledgeNotebooks(storage: KnowledgeStorage | undefined = browserStorage()) {
  if (!storage) return []
  const value = storage.getItem(CMCC_KNOWLEDGE_STORAGE_KEY)
  if (!value) return []

  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isNotebook).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
  } catch {
    return []
  }
}

export function cmccSaveKnowledgeNotebooks(notebooks: KnowledgeNotebook[], storage: KnowledgeStorage | undefined = browserStorage()) {
  storage?.setItem(CMCC_KNOWLEDGE_STORAGE_KEY, JSON.stringify(notebooks))
}

export function cmccUpsertKnowledgeNotebook(notebooks: KnowledgeNotebook[], notebook: KnowledgeNotebook) {
  return [notebook, ...notebooks.filter((item) => item.id !== notebook.id)].sort(
    (a, b) => b.lastOpenedAt - a.lastOpenedAt,
  )
}

export function cmccRememberKnowledgeSession(notebook: KnowledgeNotebook, sessionID: string) {
  return {
    ...notebook,
    sessionID,
    sessionIDs: [...new Set([sessionID, ...(notebook.sessionIDs ?? []), ...(notebook.sessionID ? [notebook.sessionID] : [])])],
  }
}

export function cmccKnowledgeNotebookForSession(notebooks: KnowledgeNotebook[], session: KnowledgeSession) {
  const metadataID = session.metadata?.cmccKnowledgeNotebookID
  if (typeof metadataID === "string") {
    const matched = notebooks.find((notebook) => notebook.id === metadataID)
    if (matched) return matched
  }

  const remembered = notebooks.find(
    (notebook) => notebook.sessionID === session.id || notebook.sessionIDs?.includes(session.id),
  )
  if (remembered) return remembered

  const directory = normalizeDirectory(session.directory)
  return notebooks.find((notebook) => normalizeDirectory(notebook.directory) === directory)
}

export function cmccBuildKnowledgeGraph(files: Array<{ path: string; content: string }>): KnowledgeGraph {
  const nodes = files.map((file) => ({
    id: file.path,
    path: file.path,
    label: cleanName(file.path),
    degree: 0,
    inDegree: 0,
    outDegree: 0,
    x: 0,
    y: 0,
  }))
  const byID = new Map(nodes.map((node) => [node.id, node]))
  const aliases = new Map<string, KnowledgeGraphNode>()

  files.forEach((file, index) => {
    const node = nodes[index]
    const names = [file.path, basename(file.path), node.label, ...frontmatterAliases(file.content)]
    names.forEach((name) => aliases.set(normalizeWikiName(name), node))
  })

  const seen = new Set<string>()
  const edges = files.flatMap((file) => {
    const source = byID.get(file.path)
    if (!source) return []

    return [...file.content.matchAll(/\[\[([^\]\n]{1,180})\]\]/g)].flatMap((match) => {
      const target = aliases.get(normalizeWikiName(match[1]))
      if (!target || target.id === source.id) return []
      const id = `${source.id}\u0000${target.id}`
      if (seen.has(id)) return []
      seen.add(id)
      source.outDegree += 1
      source.degree += 1
      target.inDegree += 1
      target.degree += 1
      return [{ id, source: source.id, target: target.id }]
    })
  })

  const ordered = nodes.toSorted((a, b) => b.degree - a.degree || a.label.localeCompare(b.label, "zh-CN"))
  ordered.forEach((node, index) => {
    if (index === 0) return
    const angle = index * 2.399963229728653
    const radius = Math.min(390, 80 + Math.sqrt(index) * 72)
    node.x = Math.cos(angle) * radius
    node.y = Math.sin(angle) * radius * 0.78
  })

  return { nodes: ordered, edges }
}

export function normalizeWikiName(value: string) {
  return cleanName(value.split("|")[0].split("#")[0])
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function browserStorage() {
  if (typeof localStorage === "undefined") return
  return localStorage
}

function isNotebook(value: unknown): value is KnowledgeNotebook {
  if (!value || typeof value !== "object") return false
  const notebook = value as Partial<KnowledgeNotebook>
  return (
    typeof notebook.id === "string" &&
    typeof notebook.name === "string" &&
    typeof notebook.description === "string" &&
    typeof notebook.emoji === "string" &&
    typeof notebook.directory === "string" &&
    typeof notebook.createdAt === "number" &&
    typeof notebook.updatedAt === "number" &&
    typeof notebook.lastOpenedAt === "number" &&
    (notebook.sessionIDs === undefined ||
      (Array.isArray(notebook.sessionIDs) && notebook.sessionIDs.every((sessionID) => typeof sessionID === "string")))
  )
}

function normalizeDirectory(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()
}

function joinPath(root: string, ...parts: string[]) {
  const separator = root.includes("\\") ? "\\" : "/"
  return [root.replace(/[\\/]+$/, ""), ...parts.map((part) => part.replace(/^[\\/]+|[\\/]+$/g, ""))].join(
    separator,
  )
}

function slug(value: string) {
  const result = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
  return result || "notebook"
}

function basename(value: string) {
  return value.split(/[\\/]/).pop() ?? value
}

function cleanName(value: string) {
  return basename(value)
    .replace(/\.(md|markdown|txt)$/i, "")
    .trim()
}

function frontmatterAliases(content: string) {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatter) return []
  const line = frontmatter[1]
    .split("\n")
    .find((item) => /^\s*(aliases|alias)\s*:/i.test(item))
  if (!line) return []
  return line
    .replace(/^\s*(aliases|alias)\s*:/i, "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
}
