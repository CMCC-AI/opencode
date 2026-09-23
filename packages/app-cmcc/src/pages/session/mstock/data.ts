export { mstockMention, shouldUseMstockPage } from "./page-selection"
import type { AgentWorkbench, SessionArtifact, SessionTranscript } from "../agent-workbench/model"
import {
  buildAgentNodes,
  buildNestedAgentSessions,
  deriveSessionStatus,
  extractAssistantMarkdown,
  extractOverviewConversation,
  extractWorkbenchMessages,
  extractTaskChildPreferences,
  extractUserQuery,
} from "../agent-workbench/session-adapter"
import { calculateElapsedMs, sumSessionTokens } from "../agent-workbench/statistics"
import { cmccArtifactDirectory } from "@/utils/cmcc-workspace"
import { cmccWorkspaceRelativePath } from "@/utils/cmcc-artifact-paths"
import { MSTOCK_ARTIFACT_ROLES, MSTOCK_LEAD_AGENT, MSTOCK_MEMBERS } from "./config"

export function mstockScope(directory: string, metadata: unknown, artifacts: readonly SessionArtifact[]) {
  const absolute = cmccArtifactDirectory(metadata, directory)
  const configured = absolute ? cmccWorkspaceRelativePath(directory, absolute) : undefined
  const roots = new Set<string>()
  for (const file of artifacts) {
    if (file.path.split("/").some((part) => part === ".." || part === ".")) continue
    if (configured && file.path.startsWith(`${configured}/`)) roots.add(configured)
    const legacy = /^(tmp\/comparison-workspace\/\d{8}-\d{4})\/[^/]+$/.exec(file.path)
    if (legacy) roots.add(legacy[1])
  }
  if (roots.size > 1) return { root: undefined, warnings: ["检测到多个多股对比产物目录，无法确定归属"] }
  const root = [...roots][0] ?? configured
  return {
    root,
    warnings: root && root !== configured ? ["当前产物未写入独立会话目录，已按真实 write 记录兼容展示"] : [],
  }
}
export function mstockFiles(files: readonly SessionArtifact[], transcripts: readonly SessionTranscript[]) {
  const scripts = transcripts.flatMap((entry) =>
    entry.messages.flatMap((message) =>
      (entry.parts[message.id] ?? []).flatMap((part) => {
        if (part.type !== "tool" || part.tool !== "bash" || part.state.status !== "completed") return []
        const command = String(part.state.input.command ?? "")
        const script =
          /(?:^|[;&|\n])\s*(?:python3?|node|bun)(?:\.exe)?\s+["']?[^\r\n]*?(render_html\.py|export-report-pdf\.mjs|stats\.py)(?:["']|\s|$)/.exec(
            command,
          )?.[1]
        const filename =
          script === "render_html.py"
            ? "40-comparison-report.html"
            : script === "export-report-pdf.mjs"
              ? "45-comparison-report.pdf"
              : script === "stats.py"
                ? "50-stats.json"
                : undefined
        return filename
          ? [
              {
                filename,
                createdAt: part.state.time.end,
                partId: part.id,
                messageId: message.id,
                ownerSessionId: entry.session.id,
                ownerAgentId: entry.session.agent ?? "",
              },
            ]
          : []
      }),
    ),
  )
  return files.map((file) => ({
    ...file,
    ...(!file.partId
      ? scripts.filter((event) => event.filename === file.filename).sort((a, b) => b.createdAt - a.createdAt)[0]
      : {}),
    role: /(?:^|\/)(inputs|attachments)\//.test(file.path)
      ? ("supporting" as const)
      : (MSTOCK_ARTIFACT_ROLES[file.filename]?.role ?? file.role),
  }))
}
export function mstockWorkbench(input: {
  rootId: string
  transcripts: readonly SessionTranscript[]
  files: SessionArtifact[]
  selected: string
  running?: boolean
  now?: number
  loading?: boolean
  warnings?: string[]
  error?: string
}): AgentWorkbench {
  const transcripts = new Map(input.transcripts.map((entry) => [entry.session.id, entry]))
  const root = transcripts.get(input.rootId)
  const leadId = root && extractTaskChildPreferences(root).get(MSTOCK_LEAD_AGENT)
  const leads = input.transcripts.filter(
    (entry) => entry.session.parentID === input.rootId && entry.session.agent === MSTOCK_LEAD_AGENT,
  )
  const lead =
    (leadId ? transcripts.get(leadId) : undefined) ??
    (leads.length === 1 ? leads[0] : undefined) ??
    (root?.session.agent === MSTOCK_LEAD_AGENT ? root : undefined)
  const children = input.transcripts
    .filter((entry) => lead && entry.session.parentID === lead.session.id)
    .map((entry) => entry.session)
  const nodes = buildAgentNodes({
    members: MSTOCK_MEMBERS,
    children,
    transcripts,
    preferredSessionIds: lead ? extractTaskChildPreferences(lead) : undefined,
  })
  const chosen = nodes.nodes.find((node) => node.id === input.selected)
  const files = mstockFiles(input.files, input.transcripts)
  const reportDirectories = new Set(
    files.filter((file) => file.role !== "supporting").map((file) => file.path.split("/").slice(0, -1).join("/")),
  )
  const report = (role: "text-report" | "visual-report") => {
    const matches = files.filter((file) => file.role === role)
    return reportDirectories.size === 1 && matches.length === 1 ? matches[0].path : undefined
  }
  const ambiguities = [
    ...(reportDirectories.size > 1 ? ["检测到多个最终报告目录，暂时无法确定归属"] : []),
    ...(input.warnings ?? []),
    ...nodes.ambiguities,
    ...(leads.length > 1 && !lead ? ["存在多个团长执行记录，暂时无法确定本次执行"] : []),
  ]
  for (const role of ["text-report", "visual-report"])
    if (files.filter((file) => file.role === role).length > 1) ambiguities.push("存在多个最终报告，无法确定归属")
  return {
    rootSessionId: input.rootId,
    query: root ? extractUserQuery(root.messages, root.parts) : "",
    overviewMarkdown: root
      ? extractAssistantMarkdown(root.messages, root.parts) ||
        (lead ? extractAssistantMarkdown(lead.messages, lead.parts) : "")
      : "",
    overviewTurns: root ? extractOverviewConversation(root.messages, root.parts) : [],
    overviewMessages: root
      ? [
          ...extractWorkbenchMessages(root.messages, root.parts),
          ...(!extractAssistantMarkdown(root.messages, root.parts) && lead
            ? extractWorkbenchMessages(lead.messages, lead.parts).filter((message) => message.role === "assistant")
            : []),
        ]
      : [],
    overviewStatus: input.running ? "running" : root ? deriveSessionStatus(root) : "waiting",
    agents: nodes.nodes,
    nestedAgentSessions: buildNestedAgentSessions({
      parentSessionId: chosen?.sessionId,
      sessions: input.transcripts.map((entry) => entry.session),
      transcripts,
    }),
    nestedAgentSessionsLoading: false,
    stats: {
      elapsedMs: root
        ? calculateElapsedMs({
            root,
            transcripts: [...transcripts.values()],
            running: !!input.running,
            now: input.now ?? Date.now(),
          })
        : 0,
      tokenCount: sumSessionTokens([...transcripts.values()].map((entry) => entry.session)),
      uniqueSearchUrlCount: 0,
      expertCount: MSTOCK_MEMBERS.length,
    },
    artifacts: files,
    fileArtifacts: files,
    textReportPath: report("text-report"),
    visualReportPath: report("visual-report"),
    ambiguities,
    loading: !!input.loading,
    error: input.error,
  }
}
export function mstockProgress(workbench: AgentWorkbench, delivered: boolean) {
  return (workbench.agents.filter((node) => node.status === "completed").length + (delivered ? 1 : 0)) * 25
}
