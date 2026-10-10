import { expect, test } from "bun:test"
import { coverage, coverageStatus, phaseState, reflectionData, replayResearch, safetyData } from "./presentation"
import type { ResearchDetail } from "./model"

test("reflection fields use actual output_data and coverage records", () => {
  const data = reflectionData({
    thinking_processes: [
      {
        output_data: {
          research_summary: "真实总结",
          gap_analysis: "缺口",
          next_steps: ["继续核验"],
          分析结果: {
            step_coverage_analysis: [
              { step_number: 1, coverage_status: "充分覆盖" },
              { step_number: 2, coverage_status: "部分覆盖" },
              { step_number: 3, coverage_status: "未覆盖" },
            ],
          },
        },
      },
    ],
    round_completed: true,
  })
  expect(data.research_summary).toBe("真实总结")
  expect(coverage(data)).toEqual({
    total: 3,
    covered: 2,
    percent: 67,
    full: 1,
    partial: 1,
    uncovered: 1,
    unknown: 0,
    uncoveredSteps: [3],
  })
  expect(coverage({})).toBeUndefined()
})

test("observed zero-coverage rounds remain uncovered rather than inferred from report completion", () => {
  const records = Array.from({ length: 8 }, (_, index) => ({ step_number: index + 1, coverage_status: "未覆盖" }))
  const summary = coverage({ step_coverage_analysis: records, overall_progress: { covered_steps: 0, total_steps: 8 } })
  expect(summary).toMatchObject({ total: 8, covered: 0, percent: 0, full: 0, partial: 0, uncovered: 8, unknown: 0 })
  expect(summary?.uncoveredSteps).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
})

test("missing status or step number never becomes an invented uncovered step", () => {
  expect(coverageStatus(undefined)).toBe("default")
  expect(coverageStatus("其它状态")).toBe("default")
  expect(coverage({ step_coverage_analysis: [{ step_number: 1 }, { coverage_status: "未覆盖" }] })).toMatchObject({
    uncovered: 1,
    unknown: 1,
    uncoveredSteps: [],
  })
})

test("overall-only progress does not fabricate full and partial counts", () => {
  expect(coverage({ overall_progress: { total_steps: 3, covered_steps: 2 } })).toMatchObject({
    total: 3,
    covered: 2,
    percent: 67,
    full: undefined,
    partial: undefined,
    uncovered: undefined,
  })
})
test("progress requires execution evidence instead of a completed session guess", () => {
  expect(phaseState([], ["web_search"])).toBe("waiting")
  expect(phaseState([], ["web_search"], "web_search")).toBe("active")
  expect(phaseState([{ name: "web_search", payload: {}, createdAt: 1 }], ["web_search"])).toBe("completed")
})
test("absent safety fields stay unknown", () => {
  expect(safetyData({ steps: [] })).toBeUndefined()
  expect(
    safetyData({ steps: [{ name: "safety_check", payload: { reason: "待核验" }, createdAt: 1 }] })?.safe,
  ).toBeUndefined()
})
test("replay releases only observed steps and returns the untouched snapshot on stop/end", () => {
  const detail: ResearchDetail = {
    session: {
      id: "replay",
      source: "langgraph",
      productType: "general-deepinsight",
      title: "回放测试",
      query: "研究问题",
      status: "completed",
      tokenCount: 33,
      sourcesCount: 2,
      reportLength: 7,
      elapsedSeconds: 60,
      createdAt: "2026-10-08T00:00:00Z",
      updatedAt: "2026-10-08T00:01:00Z",
    },
    conversationData: {
      steps: [
        { name: "generate_query", payload: {}, createdAt: 1 },
        { name: "finalize_answer", payload: {}, createdAt: 2 },
        { name: "viz_post_process", payload: {}, createdAt: 3 },
      ],
      visualReport: { title: "最终图表" },
    },
    reportContent: "真实报告文本",
    dataVersion: "1",
  }
  const start = replayResearch(detail, 0)
  expect(start.conversationData.steps).toEqual([])
  expect(start.reportContent).toBe("")
  expect(start.conversationData.visualReport).toBeUndefined()
  expect(start.session.tokenCount).toBeNull()
  expect(replayResearch(detail, 1)).toBe(detail)
  expect(detail.session.status).toBe("completed")
})
