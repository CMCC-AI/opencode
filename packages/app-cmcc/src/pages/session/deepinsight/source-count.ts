import type { SessionArtifact } from "../agent-workbench/model"

export function deepInsightReferenceArtifact(artifacts: readonly SessionArtifact[], reportPath?: string) {
  if (!reportPath) return undefined
  const directory = reportPath.includes("/") ? reportPath.slice(0, reportPath.lastIndexOf("/") + 1) : ""
  const matches = artifacts.filter((artifact) => artifact.path === `${directory}22-references.json`)
  return matches.length === 1 ? matches[0] : undefined
}

export function countDeepInsightSources(text: string): number | undefined {
  try {
    const references: unknown = JSON.parse(text)
    if (!Array.isArray(references)) return undefined
    const keys = new Set<string>()
    for (const reference of references) {
      if (!reference || typeof reference !== "object" || Array.isArray(reference)) return undefined
      const { key, kind } = reference
      if (typeof key !== "string" || !key.trim()) return undefined
      if (kind === "local" && /^local:SRC-\d+$/.test(key)) {
        keys.add(key)
        continue
      }
      if (kind !== "web") return undefined
      const url = new URL(key)
      if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
      keys.add(url.href)
    }
    return keys.size
  } catch {
    return undefined
  }
}
