import { array, object, text, type JsonObject, type ResearchData, type ResearchStatus } from "./model"
import { outputData, stringList } from "./presentation"

export const hiddenThinkingNodes = new Set([
  "prompt_matching",
  "safety_check",
  "sensitive_word_check",
  "intent_check",
  "intent_analysis",
  "continue_research",
])

export type ThinkingItem = {
  key: string
  node: string
  kind: "step" | "plan" | "confirmation"
  payload: JsonObject
  record?: JsonObject
  pending?: boolean
}

export const thinkingLabels: Record<string, string> = {
  generate_query: "生成研究计划",
  query_generation: "生成研究计划",
  plan_draft_generation: "生成研究计划",
  interrupt_plan_confirmation: "研究计划确认",
  web_search: "网络搜索",
  reflection: "深度反思",
  inductive_check: "诱导性检测",
  file_extract: "文件解析",
  generate_outline: "生成大纲",
  enhance_outline: "完善大纲",
  finalize_answer: "报告撰写",
  generate_answer: "报告撰写",
  viz_generation: "生成可视化内容",
  viz_post_process: "可视化报告",
}

export const thinkingColors: Record<string, string> = {
  generate_query: "green",
  query_generation: "green",
  plan_draft_generation: "green",
  web_search: "blue",
  reflection: "orange",
  generate_outline: "purple",
  enhance_outline: "purple",
  finalize_answer: "red",
  generate_answer: "red",
  viz_post_process: "blue",
}

export function thinkingItems(data: ResearchData, status: ResearchStatus, replaying = false): ThinkingItem[] {
  const cutoff = data.steps.reduce<number | undefined>((time, step) => {
    if (!Number.isFinite(step.createdAt)) return time
    return time === undefined ? step.createdAt : Math.max(time, step.createdAt)
  }, undefined)
  const history = array(data.interruptHistory)
    .map(object)
    .flatMap((record, index) => {
      const payload = object(record.payload)
      if (payload.type !== "plan_confirmation") return []
      const at =
        typeof record.confirmedAt === "number" && Number.isFinite(record.confirmedAt) ? record.confirmedAt : undefined
      if (replaying && (cutoff === undefined || at === undefined || at > cutoff)) return []
      return [{ record, payload, at, index }]
    })
  const pending =
    !replaying &&
    (status === "running" || status === "interrupted") &&
    object(data.pendingInterrupt).type === "plan_confirmation"
      ? object(data.pendingInterrupt)
      : undefined
  const hasPlanRecord =
    history.some((entry) => stringList(entry.payload.research_plan).length > 0) ||
    !!stringList(pending?.research_plan).length
  const items: Array<{ item: ThinkingItem; at?: number }> = data.steps.flatMap((step, index) => {
    if (hiddenThinkingNodes.has(step.name)) return []
    const plan = ["generate_query", "query_generation", "plan_draft_generation"].includes(step.name)
    if (plan && hasPlanRecord) return []
    return [
      {
        at: Number.isFinite(step.createdAt) ? step.createdAt : undefined,
        item: {
          key: `step:${index}:${step.name}:${step.createdAt}`,
          node: step.name,
          kind: plan ? "plan" : "step",
          payload: step.payload,
        },
      },
    ]
  })
  for (const entry of history) {
    // The draft is evidenced by this confirmation payload; no generated-at time is invented.
    if (stringList(entry.payload.research_plan).length)
      items.push({
        at: entry.at,
        item: {
          key: `plan:${entry.index}:${entry.at ?? "unrecorded"}`,
          node: "plan_draft_generation",
          kind: "plan",
          payload: entry.payload,
        },
      })
    items.push({
      at: entry.at,
      item: {
        key: `confirmation:${entry.index}:${entry.at ?? "unrecorded"}`,
        node: "interrupt_plan_confirmation",
        kind: "confirmation",
        payload: entry.payload,
        record: entry.record,
      },
    })
  }
  const ordered = items
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => {
      if (a.at === undefined) return b.at === undefined ? a.index - b.index : 1
      if (b.at === undefined) return -1
      return a.at - b.at || a.index - b.index
    })
    .map((entry) => entry.item)
  if (pending) {
    if (stringList(pending.research_plan).length)
      ordered.push({
        key: "pending-plan",
        node: "plan_draft_generation",
        kind: "plan",
        payload: pending,
      })
    ordered.push({
      key: "pending-confirmation",
      node: "interrupt_plan_confirmation",
      kind: "confirmation",
      payload: pending,
      pending: true,
    })
  }
  return ordered
}

export function thinkingResume(value: unknown) {
  if (typeof value === "string") return value.trim()
  const resume = object(value)
  if (resume.action === "confirm") return "确认当前方案"
  if (resume.action === "confirm_with_edits") return "按编辑后的计划执行"
  return text(resume.modification)
}

export function thinkingSourceHref(value: unknown) {
  const href = text(value)
  try {
    const url = new URL(href)
    if (url.protocol === "http:" || url.protocol === "https:") return href
  } catch {}
}

export function thinkingOutline(payload: JsonObject) {
  const value = payload.outline ?? outputData(payload).outline
  if (typeof value !== "string") return { data: object(value), preview: "" }
  try {
    const parsed = object(JSON.parse(value))
    if (Array.isArray(parsed.sections)) return { data: parsed, preview: "" }
  } catch {}
  return { data: {}, preview: value }
}

export function thinkingCompletion(node: string) {
  if (node === "finalize_answer" || node === "generate_answer") return "报告撰写完成"
  if (node === "viz_post_process") return "可视化报告完成"
}
