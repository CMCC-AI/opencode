import { cmccArtifactDirectory } from "@/utils/cmcc-workspace"
import { cmccWorkspaceRelativePath } from "@/utils/cmcc-artifact-paths"
import type { AgentNodeView, ArtifactDiscovery, SessionArtifact, SessionTranscript } from "../agent-workbench/model"
import { artifactByRole } from "../agent-workbench/artifacts"
import { DEEPINSIGHT_ARTIFACT_ROLES, DEEPINSIGHT_RESEARCH_MEMBERS } from "./contract"

export function safeDeepInsightArtifacts(discovery: ArtifactDiscovery): ArtifactDiscovery {
  const safe = (path: string) =>
    !!path &&
    !path.startsWith("/") &&
    !/^[A-Za-z]:/.test(path) &&
    !path.includes("\0") &&
    !path
      .replaceAll("\\", "/")
      .split("/")
      .some((part) => part === ".." || part === ".")
  const artifacts = discovery.artifacts.filter((artifact) => safe(artifact.path))
  return {
    ...discovery,
    artifacts,
    runDirectory: discovery.runDirectory && safe(discovery.runDirectory) ? discovery.runDirectory : undefined,
    ambiguities: [
      ...discovery.ambiguities,
      ...(artifacts.length !== discovery.artifacts.length ? ["已排除不安全的深度研究产物路径"] : []),
    ],
  }
}

export function deepInsightArtifactScope(directory: string, metadata: unknown, artifacts: readonly SessionArtifact[]) {
  const absolute = cmccArtifactDirectory(metadata, directory)
  const dedicated = absolute ? cmccWorkspaceRelativePath(directory, absolute) : undefined
  const roots = new Set<string>()
  for (const artifact of artifacts) {
    const path = artifact.path.replaceAll("\\", "/")
    if (path.split("/").some((part) => part === ".." || part === ".")) continue
    if (dedicated && path.startsWith(`${dedicated}/`)) roots.add(dedicated)
    const legacy = /^(tmp\/research-workspace\/\d{8}-\d{4})\/[^/]+$/.exec(path)
    if (legacy) roots.add(legacy[1])
  }
  if (roots.size > 1) return { root: undefined, warnings: ["检测到多个深度研究产物目录，暂时无法确定归属"] }
  const root = [...roots][0] ?? dedicated
  return {
    root,
    warnings:
      root && root !== dedicated ? ["当前深度研究产物未写入独立会话目录，已按当前任务的真实 write 记录兼容展示"] : [],
  }
}

export function deepInsightReports(
  artifacts: readonly SessionArtifact[],
  root: string | undefined,
): {
  text: SessionArtifact | undefined
  visual: SessionArtifact | undefined
  routePath: string | undefined
  ambiguities: string[]
} {
  const empty = { text: undefined, visual: undefined, routePath: undefined, ambiguities: [] as string[] }
  if (!root) return empty
  const safe = safeDeepInsightArtifacts({ artifacts: [...artifacts], ambiguities: [] })
  const scoped = safe.artifacts.filter((artifact) => artifact.path.startsWith(`${root}/`))
  const parent = (artifact: SessionArtifact) => artifact.path.slice(0, artifact.path.lastIndexOf("/"))
  // The scan boundary may contain a nested research workspace; it is not the report directory.
  const directories = new Set(scoped.filter((artifact) => DEEPINSIGHT_ARTIFACT_ROLES[artifact.filename]).map(parent))
  if (directories.size > 1)
    return {
      ...empty,
      ambiguities: [...safe.ambiguities, "检测到多个深度研究报告目录，暂时无法确定最终报告"],
    }
  const runDirectory = [...directories][0]
  const source = { artifacts: scoped, runDirectory, ambiguities: [] }
  const routes = scoped.filter(
    (artifact) =>
      artifact.filename === "00-execution-trace.json" &&
      (runDirectory === undefined || parent(artifact) === runDirectory),
  )
  return {
    text: artifactByRole(source, "text-report"),
    visual: artifactByRole(source, "visual-report"),
    routePath: routes.length === 1 ? routes[0].path : undefined,
    ambiguities: [
      ...safe.ambiguities,
      ...(routes.length > 1 ? ["检测到多个深度研究流程状态文件，暂时无法确定归属"] : []),
    ],
  }
}

export type DeepInsightRoute = { local: boolean; web: boolean }

export function parseDeepInsightRoute(text: string): DeepInsightRoute | undefined {
  try {
    const route = JSON.parse(text)?.route
    if (typeof route?.local_research_required !== "boolean" || typeof route?.web_research_required !== "boolean") return
    if (!route.local_research_required && !route.web_research_required) return
    return { local: route.local_research_required, web: route.web_research_required }
  } catch {
    return undefined
  }
}

export function deepInsightProgress(nodes: readonly AgentNodeView[], route?: DeepInsightRoute, publishing = false) {
  const required = nodes.filter((node) => {
    if (node.status !== "waiting" || !route) return true
    if (node.id === DEEPINSIGHT_RESEARCH_MEMBERS[0]) return route.local
    if (node.id === DEEPINSIGHT_RESEARCH_MEMBERS[1]) return route.web
    return true
  })
  const progress = required.length
    ? Math.round((required.filter((node) => node.status === "completed").length / required.length) * 100)
    : 0
  return publishing ? Math.min(99, progress) : progress
}

export function isDeepInsightDagEdgeActive(source?: string, target?: string) {
  return !!source && !!target && source !== "waiting" && target !== "waiting"
}

export function deepInsightArtifactRevision(transcripts: readonly SessionTranscript[]) {
  return transcripts
    .flatMap((transcript) =>
      transcript.messages.flatMap((message) =>
        (transcript.parts[message.id] ?? []).flatMap((part) => {
          if (part.type !== "tool" || part.state.status !== "completed") return []
          if (["write", "edit", "task"].includes(part.tool)) return [part.id]
          if (
            part.tool === "bash" &&
            /(?:report-batches|postprocess-report|render-report|export-report-pdf)\.mjs/.test(
              String(part.state.input.command),
            )
          )
            return [part.id]
          return []
        }),
      ),
    )
    .join(":")
}

export function deepInsightCatalogArtifacts(
  files: readonly SessionArtifact[],
  transcripts: readonly SessionTranscript[],
) {
  const events = transcripts.flatMap((transcript) =>
    transcript.messages.flatMap((message) =>
      (transcript.parts[message.id] ?? []).flatMap((part) => {
        if (part.type !== "tool" || part.state.status !== "completed" || part.tool !== "bash") return []
        const command = String(part.state.input.command ?? "")
        const filename = reportProducer(command)
        return filename
          ? [
              {
                filename,
                createdAt: part.state.time.end,
                ownerAgentId: transcript.session.agent ?? "",
                ownerSessionId: transcript.session.id,
                messageId: message.id,
                partId: part.id,
              },
            ]
          : []
      }),
    ),
  )
  return files.map((file) => {
    const producer = events
      .filter((event) => event.filename === file.filename)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    return {
      ...file,
      ...(!file.partId && producer ? producer : {}),
      role: DEEPINSIGHT_ARTIFACT_ROLES[file.filename]?.role ?? file.role,
    }
  })
}

function reportProducer(command: string) {
  for (const [script, args, filename] of [
    ["report-batches", "\\s+assemble\\b", "20-report.md"],
    ["render-report", "(?:\\s|$)", "30-report.html"],
    ["export-report-pdf", "(?:\\s|$)", "35-report.pdf"],
  ]) {
    const path = `(?:"[^"\\r\\n]*${script}\\.mjs"|'[^'\\r\\n]*${script}\\.mjs'|[^\\s"']*${script}\\.mjs)`
    if (new RegExp(`(?:^|&&)\\s*(?:node|bun)(?:\\.exe)?\\s+${path}${args}`).test(command)) return filename
  }
}
