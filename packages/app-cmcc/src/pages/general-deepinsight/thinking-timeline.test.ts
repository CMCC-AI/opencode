import { expect, test } from "bun:test"
import {
  thinkingCompletion,
  thinkingItems,
  thinkingOutline,
  thinkingResume,
  thinkingSourceHref,
} from "./thinking-timeline"
import type { ResearchData } from "./model"

function sample(): ResearchData {
  return {
    steps: [
      { name: "safety_check", payload: {}, createdAt: 1 },
      { name: "intent_analysis", payload: {}, createdAt: 2 },
      { name: "generate_query", payload: { research_plan: ["正式计划"] }, createdAt: 4 },
      { name: "web_search", payload: { sources_gathered: [] }, createdAt: 5 },
      { name: "reflection", payload: {}, createdAt: 6 },
      { name: "continue_research", payload: {}, createdAt: 7 },
    ],
    interruptHistory: [
      {
        payload: { type: "plan_confirmation", research_plan: ["实际初稿"] },
        resume: { action: "confirm" },
        confirmedAt: 3,
      },
    ],
  }
}

test("right timeline hides only selected nodes and retains the untouched execution data", () => {
  const data = sample()
  const before = JSON.stringify(data)
  const items = thinkingItems(data, "completed")
  expect(items.map((item) => item.node)).toEqual([
    "plan_draft_generation",
    "interrupt_plan_confirmation",
    "web_search",
    "reflection",
  ])
  expect(items[0]!.payload.research_plan).toEqual(["实际初稿"])
  expect(JSON.stringify(data)).toBe(before)
})

test("manual mentions or task titles do not manufacture a confirmation record", () => {
  const data = sample()
  delete data.interruptHistory
  expect(thinkingItems(data, "completed").map((item) => item.node)).toEqual([
    "generate_query",
    "web_search",
    "reflection",
  ])
  expect(thinkingItems(data, "completed")[0]!.payload.research_plan).toEqual(["正式计划"])
})

test("pending confirmation is read-only display evidence and is excluded for terminal states", () => {
  const data: ResearchData = {
    steps: [],
    pendingInterrupt: { type: "plan_confirmation", research_plan: ["待确认计划"] },
  }
  expect(thinkingItems(data, "interrupted").map((item) => item.kind)).toEqual(["plan", "confirmation"])
  expect(thinkingItems(data, "interrupted")[1]!.pending).toBe(true)
  expect(thinkingItems(data, "failed")).toEqual([])
  expect(thinkingItems(data, "stopped")).toEqual([])
})

test("replay releases confirmations only after their recorded time is reached", () => {
  const data = sample()
  expect(thinkingItems({ ...data, steps: data.steps.slice(0, 2) }, "running", true)).toEqual([])
  expect(thinkingItems({ ...data, steps: data.steps.slice(0, 3) }, "running", true).map((item) => item.kind)).toEqual([
    "plan",
    "confirmation",
  ])
  const record = (data.interruptHistory as Array<Record<string, unknown>>)[0]!
  delete record.confirmedAt
  expect(thinkingItems(data, "running", true).some((item) => item.kind === "confirmation")).toBe(false)
  expect(thinkingItems(data, "completed").some((item) => item.kind === "confirmation")).toBe(true)
  expect(thinkingItems({ ...sample(), steps: [] }, "running", true)).toEqual([])
  expect(
    thinkingItems(
      { ...sample(), steps: [{ name: "web_search", payload: {}, createdAt: Number.NaN }] },
      "running",
      true,
    ).some((item) => item.kind === "confirmation"),
  ).toBe(false)
})

test("multiple actual confirmations retain their order, edits and stable card keys", () => {
  const data = sample()
  const before = thinkingItems(data, "completed")
  ;(data.interruptHistory as unknown[]).push({
    payload: { type: "plan_confirmation", research_plan: ["修订初稿"] },
    resume: { action: "modify", modification: "新增公开证据" },
    confirmedAt: 5.5,
  })
  const after = thinkingItems(data, "completed")
  expect(after.map((item) => item.node)).toEqual([
    "plan_draft_generation",
    "interrupt_plan_confirmation",
    "web_search",
    "plan_draft_generation",
    "interrupt_plan_confirmation",
    "reflection",
  ])
  expect(after.find((item) => item.node === "web_search")!.key).toBe(
    before.find((item) => item.node === "web_search")!.key,
  )
  expect(thinkingResume(after[4]!.record?.resume)).toBe("新增公开证据")
  expect(after[1]!.record?.source).toBeUndefined()
})

test("resume and source formatting never invent missing values or execute non-web URLs", () => {
  expect(thinkingResume(undefined)).toBe("")
  expect(thinkingResume({ action: "confirm_with_edits" })).toBe("按编辑后的计划执行")
  expect(thinkingSourceHref("https://example.org/report")).toBe("https://example.org/report")
  expect(thinkingSourceHref("javascript:alert(1)")).toBeUndefined()
  expect(thinkingSourceHref(undefined)).toBeUndefined()
})

test("outline preserves structured object and JSON string formats with text-only fallback", () => {
  const outline = {
    title: "真实大纲",
    target_word_count: 3000,
    sections: [{ section_number: "1", section_title: "真实章节", target_words: 1000 }],
  }
  expect(thinkingOutline({ outline }).data).toEqual(outline)
  expect(thinkingOutline({ outline: JSON.stringify(outline) }).data).toEqual(outline)
  expect(thinkingOutline({ thinking_processes: [{ output_data: { outline } }] }).data).toEqual(outline)
  expect(thinkingOutline({ outline: "## 文字大纲" })).toEqual({ data: {}, preview: "## 文字大纲" })
  expect(thinkingOutline({})).toEqual({ data: {}, preview: "" })
})

test("completion text is reserved for observed report delivery steps", () => {
  expect(thinkingCompletion("finalize_answer")).toBe("报告撰写完成")
  expect(thinkingCompletion("viz_post_process")).toBe("可视化报告完成")
  expect(thinkingCompletion("generate_outline")).toBeUndefined()
  expect(thinkingCompletion("viz_generation")).toBeUndefined()
})
