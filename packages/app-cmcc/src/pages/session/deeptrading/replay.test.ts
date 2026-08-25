import { describe, expect, test } from "bun:test"
import type { AgentWorkbench } from "../agent-workbench/model"
import type { SearchUrlEvent } from "../agent-workbench/statistics"
import {
  advanceDeepTradingReplay,
  compileDeepTradingReplay,
  createDeepTradingReplayFrame,
  deepTradingReplayStage,
  replayNestedAgentSessions,
  splitReplayMarkdown,
} from "./replay"

const workbench = (): AgentWorkbench => ({
  rootSessionId: "root",
  query: "研究目标公司",
  overviewMarkdown: "# 总览\n总览正文\n\n## 结论\n结论正文",
  overviewStatus: "completed",
  agents: [
    {
      id: "agent-a",
      name: "甲",
      profession: "分析师",
      sessionId: "child-a",
      status: "completed",
      markdown: "## 甲分析\n第一段\n\n第二段",
      startedAt: 100,
      completedAt: 300,
    },
    {
      id: "agent-b",
      name: "乙",
      profession: "分析师",
      sessionId: "child-b",
      status: "completed",
      markdown: "## 乙分析\n分析完成",
      startedAt: 300,
      completedAt: 500,
    },
  ],
  nestedAgentSessions: [],
  nestedAgentSessionsLoading: false,
  stats: { elapsedMs: 40_000, tokenCount: 1_000, uniqueSearchUrlCount: 2, expertCount: 2 },
  artifacts: [
    {
      path: "C:\\workspace\\runs\\10-market-report.md",
      filename: "10-market-report.md",
      ownerAgentId: "agent-a",
      ownerSessionId: "child-a",
      messageId: "message-a",
      partId: "part-a",
      role: "supporting",
      createdAt: 350,
    },
  ],
  textReportPath: "C:\\workspace\\runs\\30-final-report.md",
  visualReportPath: "C:\\workspace\\runs\\40-report.html",
  ambiguities: [],
  loading: false,
})

const searchEvents: SearchUrlEvent[] = [
  {
    completedAt: 250,
    sessionId: "child-a",
    messageId: "message-a",
    partId: "search-a",
    urls: ["https://example.com/a", "https://example.com/shared"],
  },
  {
    completedAt: 450,
    sessionId: "child-b",
    messageId: "message-b",
    partId: "search-b",
    urls: ["https://example.com/shared"],
  },
]

describe("DeepTrading replay timeline", () => {
  test("splits headings without blank lines and keeps fenced code intact", () => {
    expect(splitReplayMarkdown("## 一\n正文\n## 二\n```ts\nconst a = 1\n\nconst b = 2\n```\n结尾")).toEqual([
      "## 一\n正文",
      "## 二\n```ts\nconst a = 1\n\nconst b = 2\n```\n结尾",
    ])
  })

  test("releases agents, unique URLs, files and reports without mutating the source", () => {
    const source = workbench()
    const timeline = compileDeepTradingReplay({
      workbench: source,
      searchUrlEvents: searchEvents,
      textReportMarkdown: "# 最终报告\n报告第一段\n\n## 建议\n报告第二段",
    })
    let frame = createDeepTradingReplayFrame(timeline)
    let nextCueIndex = 0
    const advance = (progress: number) => {
      const result = advanceDeepTradingReplay({ timeline, frame, nextCueIndex, progress })
      frame = result.frame
      nextCueIndex = result.nextCueIndex
    }

    advance(0.001)
    expect(frame.workbench.overviewStatus).toBe("running")
    expect(frame.workbench.agents.every((agent) => agent.status === "waiting")).toBe(true)

    advance(0.4)
    expect(frame.workbench.agents.map((agent) => agent.status)).toEqual(["completed", "running"])
    expect(frame.workbench.stats.uniqueSearchUrlCount).toBe(2)
    expect(frame.workbench.stats.tokenCount).toBe(400)

    advance(0.7)
    expect(frame.workbench.artifacts.map((artifact) => artifact.filename)).toEqual(["10-market-report.md"])
    expect(frame.workbench.textReportPath).toBeUndefined()

    advance(0.82)
    expect(frame.workbench.textReportPath).toBe(source.textReportPath)
    expect(frame.textReportMarkdown).toContain("最终报告")

    advance(0.93)
    expect(frame.workbench.visualReportPath).toBe(source.visualReportPath)

    advance(1)
    expect(frame.workbench.agents).toEqual(source.agents)
    expect(frame.workbench.stats).toEqual(source.stats)
    expect(frame.textReportMarkdown).toBe("# 最终报告\n报告第一段\n\n## 建议\n报告第二段")
    expect(source.overviewMarkdown).toContain("总览正文")
  })

  test("chooses only stages backed by real artifacts", () => {
    const complete = compileDeepTradingReplay({
      workbench: workbench(),
      searchUrlEvents: [],
      textReportMarkdown: "报告",
    })
    expect(deepTradingReplayStage(complete, 0.2)).toBe("team")
    expect(deepTradingReplayStage(complete, 0.7)).toBe("files")
    expect(deepTradingReplayStage(complete, 0.8)).toBe("text")
    expect(deepTradingReplayStage(complete, 0.95)).toBe("visual")

    const teamOnly = compileDeepTradingReplay({
      workbench: { ...workbench(), artifacts: [], textReportPath: undefined, visualReportPath: undefined },
      searchUrlEvents: [],
      textReportMarkdown: "",
    })
    expect(deepTradingReplayStage(teamOnly, 0.95)).toBe("team")
  })

  test("reveals nested sessions only after their real execution point", () => {
    const timeline = compileDeepTradingReplay({
      workbench: workbench(),
      searchUrlEvents: [],
      textReportMarkdown: "",
    })
    const nested = [
      {
        id: "nested",
        parentSessionId: "child-a",
        title: "二级检索",
        status: "completed" as const,
        startedAt: 200,
        completedAt: 400,
      },
    ]

    expect(replayNestedAgentSessions(timeline, nested, 0.1)).toEqual([])
    expect(replayNestedAgentSessions(timeline, nested, 0.3)[0]?.status).toBe("running")
    expect(replayNestedAgentSessions(timeline, nested, 0.6)[0]?.status).toBe("completed")
  })
})
