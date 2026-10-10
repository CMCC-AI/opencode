export const RESEARCH_API = "/api/dockapi/general-deepinsight"
export const RESEARCH_UPDATED = "general-deepinsight-updated"
export type ResearchStatus = "pending" | "running" | "interrupted" | "completed" | "failed" | "stopped"
export type JsonObject = Record<string, unknown>
export type ResearchStep = { name: string; payload: JsonObject; createdAt: number }
export type ResearchData = JsonObject & {
  steps: ResearchStep[]
  pendingInterrupt?: JsonObject
  visualReport?: JsonObject
  uploadedFiles?: Array<{ saved_name: string; original_filename: string; size: number }>
  uploadId?: string
  visualizationsMap?: Record<string, JsonObject>
  vizTablesMap?: Record<string, JsonObject>
}
export type ResearchSession = {
  id: string
  source: "langgraph"
  productType: "general-deepinsight"
  title: string
  query: string
  status: ResearchStatus
  tokenCount: number | null
  sourcesCount: number | null
  reportLength: number | null
  elapsedSeconds: number
  createdAt: string
  updatedAt: string
}
export type ResearchCase = {
  source: "langgraph"
  productType: "general-deepinsight"
  caseCode: string
  caseName: string
  caseDescription?: string
  caseTag: string
  coverUrl: string
  snapshotVersion: string
  publishedAt: string
}
export type ResearchDetail = {
  session: ResearchSession
  conversationData: ResearchData
  reportContent: string
  dataVersion: string
  readOnly?: boolean
  caseInfo?: ResearchCase
}
export type LangGraphHistoryItem = ResearchSession & {
  sourceId: string
  capabilities: { open: boolean; rename: boolean; delete: boolean }
}
export type OpenCodeHistoryItem<T> = { source: "opencode"; session: T }
export type HistoryItem<T> = OpenCodeHistoryItem<T> | { source: "langgraph"; session: LangGraphHistoryItem }

export const object = (value: unknown): JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {}
export const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
export const text = (value: unknown) => (typeof value === "string" ? value : "")
export const stepLabels: Record<string, string> = {
  safety_check: "安全校验",
  sensitive_word_check: "敏感词检查",
  intent_check: "意图确认",
  intent_analysis: "意图分析",
  inductive_check: "研究问题校验",
  file_extract: "材料提取",
  generate_query: "研究计划",
  plan_draft_generation: "计划草拟",
  web_search: "网络研究",
  reflection: "反思评估",
  continue_research: "继续研究",
  generate_outline: "报告大纲",
  enhance_outline: "大纲完善",
  finalize_answer: "文字报告",
  viz_generation: "图表生成",
  viz_post_process: "可视化报告",
}

export function langGraphHistory(value: unknown): LangGraphHistoryItem[] {
  if (!Array.isArray(value)) throw new Error("历史接口未返回有效列表")
  return value.filter((item): item is LangGraphHistoryItem => {
    const row = object(item)
    if (row.source !== "langgraph") return false
    const valid =
      row.productType === "general-deepinsight" &&
      typeof row.sourceId === "string" &&
      typeof row.id === "string" &&
      typeof row.title === "string" &&
      typeof row.updatedAt === "string" &&
      typeof row.status === "string" &&
      Object.keys(object(row.capabilities)).length > 0
    if (!valid) throw new Error("通用深度洞察历史字段缺失或格式不匹配")
    return true
  })
}

export function researchInterrupt(value: unknown): JsonObject | undefined {
  if (Array.isArray(value)) return researchInterrupt(value[0])
  const row = object(value)
  for (const key of ["__interrupt__", "interrupt", "value"])
    if (row[key] !== undefined) return researchInterrupt(row[key])
  if (["plan_confirmation", "missing_info_clarification", "intent_clarification"].includes(text(row.type))) return row
}

export function applyResearchEvent(
  detail: ResearchDetail,
  type: string,
  value: unknown,
  at = Date.now(),
): ResearchDetail {
  const data: ResearchData = { ...detail.conversationData, steps: detail.conversationData.steps }
  let report = detail.reportContent
  let status = detail.session.status
  if (type === "updates") {
    const pending = researchInterrupt(value)
    if (pending) data.pendingInterrupt = pending
    for (const [name, raw] of Object.entries(object(value))) {
      const payload = object(raw)
      if (!Object.keys(payload).length) continue
      const interrupt = researchInterrupt(payload)
      if (interrupt) data.pendingInterrupt = interrupt
      data.steps = [...data.steps, { name, payload, createdAt: at }]
      if (name === "finalize_answer") {
        report =
          text(payload.final_report) ||
          array(payload.messages)
            .map((message) => text(object(message).content))
            .find(Boolean) ||
          report
      }
      if (name === "viz_post_process" && Object.keys(object(payload.visual_report)).length)
        data.visualReport = object(payload.visual_report)
      if (name === "viz_generation" || name === "viz_post_process") {
        for (const source of [payload, object(object(array(payload.thinking_processes)[0]).output_data)]) {
          for (const key of ["visualizations", "tables"] as const) {
            const target = key === "visualizations" ? "visualizationsMap" : "vizTablesMap"
            data[target] = { ...data[target] }
            for (const rawFigure of array(source[key])) {
              const figure = object(rawFigure)
              if (typeof figure.id === "string") data[target]![figure.id] = figure
              if (typeof figure.index === "number" || typeof figure.index === "string")
                data[target]![String(figure.index)] = figure
            }
          }
        }
      }
    }
  }
  if (type === "messages" && Array.isArray(value) && object(value[1]).langgraph_node === "finalize_answer")
    report += text(object(value[0]).content)
  if (type === "values") {
    const pending = researchInterrupt(value)
    if (pending) data.pendingInterrupt = pending
    const row = object(value)
    if (typeof row.final_report === "string") report = row.final_report
    if (Object.keys(object(row.visual_report)).length) data.visualReport = object(row.visual_report)
  }
  if (type === "done" && ["completed", "failed", "stopped", "interrupted"].includes(text(object(value).status)))
    status = text(object(value).status) as ResearchStatus
  if (type === "error") status = "failed"
  if (type === "events") {
    const event = object(value)
    if (array(event.tags).some((tag) => typeof tag === "string" && tag.startsWith("graph:step:"))) {
      const node = text(object(event.metadata).langgraph_node) || text(event.name)
      if (event.event === "on_chain_start" && node) data.runningNode = node
      if (event.event === "on_chain_end" && data.runningNode === node) delete data.runningNode
    }
  }
  return {
    ...detail,
    conversationData: data,
    reportContent: report,
    session: { ...detail.session, status, ...(type === "updates" ? researchUsage(data) : {}) },
  }
}

export function researchUsage(data: ResearchData) {
  const seen = new Set<string>()
  const urls = new Set<string>()
  let tokens: number | undefined
  let sources: number | undefined
  let invalidSources = false
  for (const step of data.steps) {
    for (const raw of array(step.payload.thinking_processes)) {
      const process = object(raw)
      const key = step.name + JSON.stringify(process)
      if (seen.has(key)) continue
      seen.add(key)
      const usage = object(process.token_usage).total_tokens
      if (typeof usage === "number" && Number.isSafeInteger(usage) && usage >= 0) tokens = (tokens ?? 0) + usage
    }
    if (Array.isArray(step.payload.sources_gathered)) {
      sources = 0
      for (const raw of step.payload.sources_gathered) {
        const url = text(object(raw).url)
        if (!url.trim()) invalidSources = true
        else urls.add(url)
      }
    }
  }
  return {
    ...(tokens === undefined ? {} : { tokenCount: tokens }),
    ...(sources === undefined ? {} : { sourcesCount: invalidSources ? null : urls.size }),
  }
}

export async function consumeResearchSse(response: Response, onEvent: (type: string, value: unknown) => void) {
  if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream") || !response.body) {
    const body = await response.json().catch(() => ({}))
    throw new Error(text(object(body).message) || `研究服务响应异常（HTTP ${response.status}）`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let buffer = ""
  let type = "message"
  let lines: string[] = []
  const dispatch = () => {
    const payload = lines.join("\n")
    lines = []
    const event = type
    type = "message"
    if (!payload) return
    let value: unknown
    try {
      value = JSON.parse(payload)
    } catch {
      throw new Error("研究流返回了无法解析的数据")
    }
    onEvent(event, value)
    if (event === "error") throw new Error(text(object(value).message) || "研究执行失败")
  }
  const line = (raw: string) => {
    const value = raw.endsWith("\r") ? raw.slice(0, -1) : raw
    if (!value) return dispatch()
    if (value.startsWith(":")) return
    const colon = value.indexOf(":")
    const key = colon < 0 ? value : value.slice(0, colon)
    const content = (colon < 0 ? "" : value.slice(colon + 1)).replace(/^ /, "")
    if (key === "event") type = content
    if (key === "data") lines.push(content)
  }
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf("\n")) >= 0) {
        line(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
      }
    }
    buffer += decoder.decode()
    if (buffer) line(buffer)
    dispatch()
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
