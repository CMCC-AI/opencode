import type { ArtifactDiscovery, ArtifactRole, SessionArtifact, SessionTranscript } from "./model"

export type ArtifactRoleConfig = Record<string, { role: ArtifactRole; label?: string; expectedAgentId?: string }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function normalizeSeparators(value: string) {
  return value.replaceAll("\\", "/").replace(/\/{2,}/g, "/")
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "")
}

function isWindowsPath(value: string) {
  return /^[A-Za-z]:\//.test(value) || value.startsWith("//")
}

function relativeArtifactPath(directory: string, candidate: string) {
  const root = trimTrailingSlash(normalizeSeparators(directory))
  const path = normalizeSeparators(candidate)
  const absolute = path.startsWith("/") || isWindowsPath(path)
  if (absolute) {
    const windows = isWindowsPath(root)
    const comparableRoot = windows ? root.toLowerCase() : root
    const comparablePath = windows ? path.toLowerCase() : path
    if (comparablePath !== comparableRoot && !comparablePath.startsWith(`${comparableRoot}/`)) return
    return path.slice(root.length).replace(/^\/+/, "")
  }

  const relative = path.replace(/^\.\//, "").replace(/^\/+/, "")
  if (!relative || relative.split("/").includes("..")) return
  return relative
}

function filename(path: string) {
  return path.split("/").at(-1) ?? path
}

function dirname(path: string) {
  return path.split("/").slice(0, -1).join("/")
}

function contentSize(value: unknown) {
  if (typeof value !== "string") return
  return new TextEncoder().encode(value).length
}

function toolPaths(directory: string, input: Record<string, unknown>, metadata: Record<string, unknown>) {
  const inputPath = text(input.filePath)
  const metadataPath = text(metadata.filepath)
  const normalizedInput = inputPath ? relativeArtifactPath(directory, inputPath) : undefined
  const normalizedMetadata = metadataPath ? relativeArtifactPath(directory, metadataPath) : undefined

  if (inputPath && metadataPath && !!normalizedInput !== !!normalizedMetadata) {
    return { issue: "write 路径字段的工作目录归属不一致" }
  }
  if (inputPath && !normalizedInput) return {}
  if (metadataPath && !normalizedMetadata) return {}
  if (normalizedInput && normalizedMetadata && normalizedInput !== normalizedMetadata) {
    return { issue: `write 路径字段不一致: ${normalizedInput} / ${normalizedMetadata}` }
  }
  return { path: normalizedInput ?? normalizedMetadata }
}

export function discoverSessionArtifacts(input: {
  directory: string
  transcripts: readonly SessionTranscript[]
  roles: ArtifactRoleConfig
  allowSameAgentPathRewrites?: boolean
}): ArtifactDiscovery {
  const ambiguities: string[] = []
  const artifacts = new Map<string, SessionArtifact>()
  const conflictedPaths = new Set<string>()

  for (const transcript of input.transcripts) {
    for (const message of transcript.messages) {
      for (const part of transcript.parts[message.id] ?? []) {
        if (part.type !== "tool" || part.tool !== "write" || part.state.status !== "completed") continue
        const result = toolPaths(
          input.directory,
          part.state.input,
          isRecord(part.state.metadata) ? part.state.metadata : {},
        )
        if (result.issue) {
          ambiguities.push(`${transcript.session.id}/${part.id}: ${result.issue}`)
          continue
        }
        if (!result.path) continue
        if (conflictedPaths.has(result.path)) continue

        const name = filename(result.path)
        const configured = input.roles[name]
        const artifact: SessionArtifact = {
          path: result.path,
          filename: name,
          sizeBytes: contentSize(part.state.input.content),
          ownerAgentId: transcript.session.agent ?? "",
          ownerSessionId: transcript.session.id,
          messageId: message.id,
          partId: part.id,
          createdAt: part.state.time.end,
          role: configured?.role ?? "supporting",
          label: configured?.label,
        }
        if (configured?.expectedAgentId && configured.expectedAgentId !== artifact.ownerAgentId) {
          ambiguities.push(
            `${result.path} 实际由 ${artifact.ownerAgentId || "未知 Agent"} 写入，与配置主要产生者 ${configured.expectedAgentId} 不一致`,
          )
        }
        const current = artifacts.get(result.path)
        if (current && current.ownerSessionId !== artifact.ownerSessionId) {
          if (
            input.allowSameAgentPathRewrites &&
            current.ownerAgentId &&
            current.ownerAgentId === artifact.ownerAgentId
          ) {
            if ((artifact.createdAt ?? 0) >= (current.createdAt ?? 0)) artifacts.set(result.path, artifact)
            continue
          }
          ambiguities.push(`${result.path} 由多个子会话写入，暂时无法确定归属`)
          artifacts.delete(result.path)
          conflictedPaths.add(result.path)
          continue
        }
        if (!current || (artifact.createdAt ?? 0) >= (current.createdAt ?? 0)) artifacts.set(result.path, artifact)
      }
    }
  }

  const values = [...artifacts.values()].sort(
    (left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0) || left.path.localeCompare(right.path),
  )
  const runDirectories = new Set(
    values.filter((artifact) => input.roles[artifact.filename]).map((artifact) => dirname(artifact.path)),
  )
  if (runDirectories.size > 1) ambiguities.push("检测到多个报告目录，暂时无法确定最终报告")

  return {
    artifacts: values,
    runDirectory: runDirectories.size === 1 ? [...runDirectories][0] : undefined,
    ambiguities: [...new Set(ambiguities)],
  }
}

export function artifactByRole(discovery: ArtifactDiscovery, role: ArtifactRole) {
  if (!discovery.runDirectory) return
  const matches = discovery.artifacts.filter(
    (artifact) => artifact.role === role && dirname(artifact.path) === discovery.runDirectory,
  )
  return matches.length === 1 ? matches[0] : undefined
}
