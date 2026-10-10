import {
  array,
  object,
  text,
  type JsonObject,
  type ResearchData,
  type ResearchDetail,
  type ResearchStep,
} from "./model"

export function outputData(payload: JsonObject) {
  return object(object(array(payload.thinking_processes)[0]).output_data)
}
export function stringList(value: unknown) {
  if (typeof value === "string")
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  return array(value).filter((line): line is string => typeof line === "string" && !!line.trim())
}
export function latestPayload(data: ResearchData, names: string[]) {
  return [...data.steps].reverse().find((step) => names.includes(step.name))?.payload
}
export function reflectionData(payload: JsonObject): JsonObject {
  const output = outputData(payload)
  const analysis = object(output["分析结果"])
  return {
    ...output,
    ...analysis,
    round_completed: payload.round_completed,
    thinking_processes: payload.thinking_processes,
    knowledge_gaps_list: analysis.knowledge_gaps ?? output.knowledge_gaps_list,
  }
}
export function researchOutline(data: ResearchData) {
  const payload = latestPayload(data, ["generate_outline", "enhance_outline"])
  if (!payload) return {}
  const candidate = payload.outline ?? outputData(payload).outline
  if (typeof candidate === "object" && candidate !== null) return object(candidate)
  if (typeof candidate === "string") {
    try {
      return object(JSON.parse(candidate))
    } catch {
      return {}
    }
  }
  return {}
}
export function safetyData(data: ResearchData) {
  const payload = latestPayload(data, ["safety_check", "sensitive_word_check"])
  if (!payload) return
  const blocked = payload.sensitive_word_blocked ?? payload.is_blocked ?? payload.is_sensitive
  const safe = payload.is_safe ?? (typeof blocked === "boolean" ? !blocked : undefined)
  return {
    safe: typeof safe === "boolean" ? safe : undefined,
    type: payload.block_type ?? payload.detection_type ?? payload.violation_type,
    reason: payload.block_reason ?? payload.blocked_message ?? payload.detection_reason ?? payload.reason,
  }
}

export function coverageStatus(value: unknown) {
  const status = text(value).trim()
  if (status.includes("充分覆盖")) return "full"
  if (status.includes("部分覆盖")) return "partial"
  if (status.includes("未覆盖")) return "uncovered"
  return "default"
}

export function coverage(value: JsonObject) {
  const records = array(value.step_coverage_analysis).map(object)
  if (records.length) {
    const full = records.filter((row) => coverageStatus(row.coverage_status) === "full").length
    const partial = records.filter((row) => coverageStatus(row.coverage_status) === "partial").length
    const uncovered = records.filter((row) => coverageStatus(row.coverage_status) === "uncovered")
    return {
      total: records.length,
      covered: full + partial,
      percent: Math.round(((full + partial) / records.length) * 100),
      full,
      partial,
      uncovered: uncovered.length,
      unknown: records.length - full - partial - uncovered.length,
      uncoveredSteps: [
        ...new Set(
          uncovered.flatMap((row) =>
            typeof row.step_number === "number" && Number.isInteger(row.step_number) && row.step_number > 0
              ? [row.step_number]
              : [],
          ),
        ),
      ],
    }
  }
  const overall = object(value.overall_progress)
  const total = overall.total_steps
  const covered = overall.covered_steps
  if (typeof total !== "number" || typeof covered !== "number" || total <= 0 || covered < 0) return
  return {
    total,
    covered,
    percent: Math.round(Math.min(100, (covered / total) * 100)),
    full: undefined,
    partial: undefined,
    uncovered: undefined,
    unknown: undefined,
    uncoveredSteps: [],
  }
}

export function replayResearch(detail: ResearchDetail, progress: number): ResearchDetail {
  if (progress >= 1) return detail
  const steps = detail.conversationData.steps
  const count = Math.floor(Math.max(0, progress) * (steps.length + 1))
  const visible = steps.slice(0, count)
  const finalized = visible.some((step) => step.name === "finalize_answer")
  const visualized = visible.some((step) => step.name === "viz_post_process")
  const data: ResearchData = {
    ...detail.conversationData,
    steps: visible,
    pendingInterrupt: undefined,
    visualReport: visualized ? detail.conversationData.visualReport : undefined,
  }
  const reportRatio = finalized
    ? Math.min(
        1,
        Math.max(0, progress * (steps.length + 1) - steps.findIndex((step) => step.name === "finalize_answer")),
      )
    : 0
  return {
    ...detail,
    conversationData: data,
    reportContent: finalized
      ? detail.reportContent.slice(0, Math.floor(detail.reportContent.length * reportRatio))
      : "",
    session: { ...detail.session, status: "running", tokenCount: null, sourcesCount: null, reportLength: null },
  }
}

export function phaseState(steps: ResearchStep[], nodes: string[], runningNode?: string) {
  if (runningNode && nodes.includes(runningNode)) return "active"
  return steps.some((step) => nodes.includes(step.name)) ? "completed" : "waiting"
}

export function reportNumber(value: number | null | undefined, report = false) {
  if (value == null || !Number.isFinite(value)) return "--"
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`
  if (report && value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toLocaleString()
}
export function referenceTime(value: string) {
  const match = /^(\d+)分(\d+)秒$/.exec(value)
  if (!match) return value
  return Number(match[1]) === 0 ? `${match[2]}s` : `${match[1]}min ${match[2]}s`
}
