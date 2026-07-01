export const CMCC_WORKSPACE_RELATIVE = ".local/share/opencode"

export function cmccDefaultWorkspace(home: string | undefined) {
  if (!home) return
  const root = home.replace(/\/+$/, "")
  if (!root) return
  return `${root}/${CMCC_WORKSPACE_RELATIVE}`
}

export function cmccWorkspaceLabel(directory: string | undefined, home: string | undefined) {
  if (!directory) return "~/.local/share/opencode"
  if (!home) return directory
  const root = home.replace(/\/+$/, "")
  if (!root) return directory
  if (directory === root) return "~"
  if (directory.startsWith(`${root}/`)) return `~/${directory.slice(root.length + 1)}`
  return directory
}
