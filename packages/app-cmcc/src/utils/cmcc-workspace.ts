export const CMCC_WORKSPACE_RELATIVE = "Documents/DeepInsight"
export const CMCC_LEGACY_WORKSPACE_RELATIVE = ".local/share/opencode"
export const CMCC_CONVERSATION_WORKSPACES_EVENT = "opencode:cmcc-conversation-workspaces"

const CMCC_CONVERSATION_WORKSPACES_KEY = "opencode.cmcc.conversationWorkspaces.v1"

function normalizeRoot(input: string | undefined) {
  const root = input?.replace(/\/+$/, "").replaceAll("\\", "/")
  if (!root) return
  return root
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
