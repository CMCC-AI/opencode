import { uuid } from "./uuid"

export const CMCC_WORKSPACE_RELATIVE = "Documents/DeepInsight"
export const CMCC_LEGACY_WORKSPACE_RELATIVE = ".local/share/opencode"
export const CMCC_CONVERSATION_WORKSPACES_EVENT = "opencode:cmcc-conversation-workspaces"
export const CMCC_ARTIFACT_DIRECTORY_METADATA = "cmccArtifactDirectory"

const CMCC_CONVERSATION_WORKSPACES_KEY = "opencode.cmcc.conversationWorkspaces.v1"
const ensuredWorkspaces = new Map<string, Promise<void>>()

function normalizeRoot(input: string | undefined) {
  const root = normalizePath(input)
  if (!root) return
  return root
}

function normalizePath(input: string | undefined) {
  const value = input?.trim().replaceAll("\\", "/")
  if (!value) return
  const prefix = value.startsWith("//") ? "//" : value.startsWith("/") ? "/" : ""
  const path = value
    .slice(prefix.length)
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "")
  return `${prefix}${path}` || prefix
}

function isAbsolutePath(input: string) {
  return input.startsWith("/") || /^[A-Za-z]:\//.test(input)
}

function hasUnsafeSegment(input: string) {
  return input.includes("\0") || input.split("/").some((segment) => segment === "." || segment === "..")
}

function comparisonPath(input: string) {
  return /^[A-Za-z]:\//.test(input) || input.startsWith("//") ? input.toLowerCase() : input
}

function joinPath(root: string, child: string) {
  return root === "/" ? `/${child}` : `${root}/${child}`
}

function pad(input: number) {
  return String(input).padStart(2, "0")
}

export function cmccWorkspaceRoot(home: string | undefined) {
  if (!home) return
  const root = normalizeRoot(home)
  if (!root) return
  return `${root}/${CMCC_WORKSPACE_RELATIVE}`
}

export function cmccLegacyWorkspace(home: string | undefined) {
  const root = normalizeRoot(home)
  if (!root) return
  return `${root}/${CMCC_LEGACY_WORKSPACE_RELATIVE}`
}

export function cmccDateWorkspace(home: string | undefined, date = new Date()) {
  const root = cmccWorkspaceRoot(home)
  if (!root) return
  return `${root}/${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function cmccConversationWorkspace(home: string | undefined, date = new Date()) {
  const root = cmccDateWorkspace(home, date)
  if (!root) return
  return `${root}/conversation-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function cmccRuntimeWorkspace(home: string | undefined, directory: string | undefined): string | undefined {
  return normalizeRoot(directory) ?? cmccWorkspaceRoot(home)
}

export function cmccArtifactWorkspace(runtime: string | undefined, date = new Date(), id = uuid()): string | undefined {
  const root = normalizeRoot(runtime)
  const artifactID = id.trim().replace(/[^A-Za-z0-9_-]+/g, "-")
  if (!root || !artifactID) return
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("-")
  return joinPath(root, `runs/${timestamp}-${artifactID}`)
}

export function cmccArtifactDirectory(metadata: unknown, runtime?: string): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return
  const value = (metadata as Record<string, unknown>)[CMCC_ARTIFACT_DIRECTORY_METADATA]
  if (typeof value !== "string") return
  const artifact = normalizePath(value)
  if (!artifact || !isAbsolutePath(artifact) || hasUnsafeSegment(artifact)) return
  if (!runtime) return artifact

  const root = normalizeRoot(runtime)
  if (!root || !isAbsolutePath(root) || hasUnsafeSegment(root)) return
  const comparedArtifact = comparisonPath(artifact)
  const comparedRoot = comparisonPath(root)
  const runs = comparedRoot === "/" ? "/runs/" : `${comparedRoot}/runs/`
  if (!comparedArtifact.startsWith(runs)) return
  return artifact
}

export function cmccArtifactSystemPrompt(runtime: string, artifact: string): string {
  return [
    `本次会话的独立产物目录是 ${artifact}，稳定运行目录是 ${runtime}。`,
    "所有文件工具都必须使用该产物目录内的绝对路径；所有 shell 命令都必须把 workdir 指向该产物目录。",
    "所有新建、修改、下载和生成的文件都必须限制在该独立产物目录内；调用子 agent 时必须显式传递并让其继承同一目录边界。",
    "不得读取或覆盖 runs 下其他会话目录；相对工作区路径均以该独立产物目录为基准。",
  ].join("\n")
}

export async function cmccEnsureWorkspace(
  directory: string | undefined,
  createDirectory: (directory: string) => Promise<unknown> | unknown,
  scope = "default",
): Promise<string | undefined> {
  if (!directory) return
  const key = `${scope}\n${directory}`
  const pending = ensuredWorkspaces.get(key)
  if (pending) {
    await pending
    return directory
  }

  const created = Promise.resolve()
    .then(() => createDirectory(directory))
    .then(() => undefined)
  ensuredWorkspaces.set(key, created)
  try {
    await created
  } finally {
    if (ensuredWorkspaces.get(key) === created) ensuredWorkspaces.delete(key)
  }
  return directory
}

export async function cmccCreateConversationWorkspace(
  home: string | undefined,
  createDirectory: (directory: string) => Promise<unknown> | unknown,
) {
  const directory = cmccConversationWorkspace(home) ?? cmccDateWorkspace(home) ?? cmccWorkspaceRoot(home)
  if (!directory) return
  await Promise.resolve(createDirectory(directory))
  cmccRememberConversationWorkspace(directory)
  return directory
}

export function cmccDefaultWorkspace(home: string | undefined) {
  return cmccWorkspaceRoot(home)
}

export function cmccWorkspaceSessionPath(home: string | undefined) {
  return cmccWorkspaceRoot(home)
    ?.replaceAll("\\", "/")
    .replace(/^(?:[A-Za-z]:)?\/+/, "")
}

export function cmccIsWorkspaceDirectory(directory: string | undefined, home: string | undefined) {
  if (!directory) return false
  // Server responses carry platform-native separators on Windows while stored
  // paths use forward slashes, so compare on a normalized form.
  const normalized = directory.replaceAll("\\", "/")
  const root = cmccWorkspaceRoot(home)
  const legacy = cmccLegacyWorkspace(home)
  if (!home) {
    return (
      normalized.includes(`/${CMCC_WORKSPACE_RELATIVE}/`) ||
      normalized.endsWith(`/${CMCC_WORKSPACE_RELATIVE}`) ||
      normalized === CMCC_LEGACY_WORKSPACE_RELATIVE ||
      normalized.endsWith(`/${CMCC_LEGACY_WORKSPACE_RELATIVE}`)
    )
  }
  return Boolean(
    (root && (normalized === root || normalized.startsWith(`${root}/`))) || (legacy && normalized === legacy),
  )
}

export function cmccWorkspaceLabel(directory: string | undefined, home: string | undefined) {
  if (!directory) return `~/${CMCC_WORKSPACE_RELATIVE}`
  if (!home) return directory
  const root = normalizeRoot(home)
  if (!root) return directory
  const normalized = directory.replaceAll("\\", "/")
  if (normalized === root) return "~"
  if (normalized.startsWith(`${root}/`)) return `~/${normalized.slice(root.length + 1)}`
  return directory
}

export function cmccConversationDirectories(
  home: string | undefined,
  remembered: string[],
  sessions: { directory: string }[],
) {
  const seen = new Set<string>()
  return [...remembered, ...sessions.map((session) => session.directory), cmccLegacyWorkspace(home)].filter(
    (directory): directory is string => {
      if (!directory) return false
      const key = directory.replaceAll("\\", "/")
      if (seen.has(key)) return false
      seen.add(key)
      return cmccIsWorkspaceDirectory(directory, home)
    },
  )
}

export function cmccConversationWorkspaces() {
  if (typeof localStorage === "undefined") return [] as string[]
  try {
    const parsed = JSON.parse(localStorage.getItem(CMCC_CONVERSATION_WORKSPACES_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
  } catch {
    return []
  }
}

export function cmccRememberConversationWorkspace(directory: string) {
  if (typeof localStorage === "undefined") return
  const next = [directory, ...cmccConversationWorkspaces().filter((item) => item !== directory)].slice(0, 200)
  localStorage.setItem(CMCC_CONVERSATION_WORKSPACES_KEY, JSON.stringify(next))
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CMCC_CONVERSATION_WORKSPACES_EVENT))
}

export function cmccForgetConversationWorkspace(directory: string) {
  if (typeof localStorage === "undefined") return
  const next = cmccConversationWorkspaces().filter((item) => item !== directory)
  localStorage.setItem(CMCC_CONVERSATION_WORKSPACES_KEY, JSON.stringify(next))
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CMCC_CONVERSATION_WORKSPACES_EVENT))
}
