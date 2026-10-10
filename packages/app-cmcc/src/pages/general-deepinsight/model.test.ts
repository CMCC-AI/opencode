import { describe, expect, test } from "bun:test"
import {
  applyResearchEvent,
  consumeResearchSse,
  langGraphHistory,
  researchInterrupt,
  type ResearchDetail,
} from "./model"
import { prepareResearchCase, prepareResearchDraft, takeResearchCase, takeResearchDraft } from "./handoff"

function detail(): ResearchDetail {
  return {
    session: {
      id: "research",
      source: "langgraph",
      productType: "general-deepinsight",
      title: "测试研究",
      query: "研究问题",
      status: "running",
      tokenCount: null,
      sourcesCount: null,
      reportLength: null,
      elapsedSeconds: 1,
      createdAt: "2026-10-08T00:00:00Z",
      updatedAt: "2026-10-08T00:00:00Z",
    },
    conversationData: { steps: [] },
    reportContent: "",
    dataVersion: "1",
  }
}

describe("separate LangGraph identity", () => {
  test("never turns OpenCode history into LangGraph history", () => {
    expect(langGraphHistory([{ source: "opencode", sourceId: "old", productType: "deep-research" }])).toEqual([])
    const row = { ...detail().session, sourceId: "research", capabilities: { open: true, rename: true, delete: true } }
    expect(langGraphHistory([row, { source: "opencode" }])).toEqual([row])
  })
  test("does not silently accept malformed recognized fields", () => {
    expect(() => langGraphHistory({})).toThrow()
    expect(() => langGraphHistory([{ source: "langgraph", title: "bad" }])).toThrow()
  })
})

test("streaming report only contains the final writing node", () => {
  const outline = applyResearchEvent(detail(), "messages", [
    { content: "outline" },
    { langgraph_node: "generate_outline" },
  ])
  expect(outline.reportContent).toBe("")
  const partial = applyResearchEvent(outline, "messages", [
    { content: "部分正文" },
    { langgraph_node: "finalize_answer" },
  ])
  expect(partial.reportContent).toBe("部分正文")
  const final = applyResearchEvent(partial, "updates", { finalize_answer: { final_report: "最终正文" } })
  expect(final.reportContent).toBe("最终正文")
  expect(final.conversationData.steps[0]!.name).toBe("finalize_answer")
})

test("keeps real chart options, tables and visual sections", () => {
  const option = { series: [{ type: "bar", data: [1, 2] }] }
  const figure = applyResearchEvent(detail(), "updates", {
    viz_generation: {
      visualizations: [{ id: "VIZ-001", index: 1, option }],
      tables: [{ id: "table-1", columns: ["中文"], rows: [["数据"]] }],
    },
  })
  expect(figure.conversationData.visualizationsMap?.["1"]?.option).toEqual(option)
  expect(figure.conversationData.vizTablesMap?.["table-1"]?.columns).toEqual(["中文"])
  const report = { title: "可视化", sections: [{ heading: "章节", blocks: [{ type: "chart", chart: { option } }] }] }
  expect(
    applyResearchEvent(figure, "updates", { viz_post_process: { visual_report: report } }).conversationData
      .visualReport,
  ).toEqual(report)
})

test("nested interrupt is retained until explicitly resumed", () => {
  const pending = { type: "plan_confirmation", research_plan: ["核对"] }
  expect(researchInterrupt({ __interrupt__: [{ value: pending }] })).toEqual(pending)
  expect(researchInterrupt({ arbitrary: true })).toBeUndefined()
  const stopped = applyResearchEvent(detail(), "updates", { __interrupt__: [{ value: pending }] })
  expect(stopped.conversationData.pendingInterrupt).toEqual(pending)
  expect(applyResearchEvent(stopped, "done", { status: "interrupted" }).session.status).toBe("interrupted")
})

test("error and stopped events never become completed", () => {
  expect(applyResearchEvent(detail(), "error", { message: "failure" }).session.status).toBe("failed")
  expect(applyResearchEvent(detail(), "done", { status: "stopped" }).session.status).toBe("stopped")
  expect(applyResearchEvent(detail(), "done", {}).session.status).toBe("running")
})

test("SSE preserves single-byte fragmented UTF8, CRLF, multiline and final frame", async () => {
  const bytes = new TextEncoder().encode(
    'event: updates\r\ndata: {\r\ndata: "generate_query":{"research_plan":["中文"]}}\r\n\r\nevent: done\r\ndata: {"status":"completed"}',
  )
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
      controller.close()
    },
  })
  const events: unknown[] = []
  await consumeResearchSse(new Response(stream, { headers: { "content-type": "text/event-stream" } }), (type, value) =>
    events.push({ type, value }),
  )
  expect(events).toEqual([
    { type: "updates", value: { generate_query: { research_plan: ["中文"] } } },
    { type: "done", value: { status: "completed" } },
  ])
})

test("SSE failures propagate instead of completing silently", async () => {
  await expect(
    consumeResearchSse(
      new Response('event: error\ndata: {"message":"上游失败"}\n\n', {
        headers: { "content-type": "text/event-stream" },
      }),
      () => undefined,
    ),
  ).rejects.toThrow("上游失败")
  await expect(consumeResearchSse(new Response("<html>bad</html>", { status: 502 }), () => undefined)).rejects.toThrow(
    "502",
  )
  await expect(
    consumeResearchSse(
      new Response("event: updates\ndata: bad\n\n", { headers: { "content-type": "text/event-stream" } }),
      () => undefined,
    ),
  ).rejects.toThrow("无法解析")
})

test("case handoff is one-shot and isolated by current account and route", () => {
  prepareResearchCase(7, "case", detail())
  expect(takeResearchCase(99, "case")).toBeUndefined()
  prepareResearchCase(7, "case", detail())
  expect(takeResearchCase(7, "case")).toEqual(detail())
  expect(takeResearchCase(7, "case")).toBeUndefined()
  prepareResearchCase(7, "case", detail())
  expect(takeResearchCase(7, "other-case")).toBeUndefined()
})

test("same-case drafts remain one-shot and account-scoped without private attachments", () => {
  prepareResearchDraft(7, "公开研究问题")
  expect(takeResearchDraft(99)).toBeUndefined()
  prepareResearchDraft(7, "公开研究问题")
  expect(takeResearchDraft(7)).toBe("公开研究问题")
  expect(takeResearchDraft(7)).toBeUndefined()
})
