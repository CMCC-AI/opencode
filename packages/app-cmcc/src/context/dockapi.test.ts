import { describe, expect, test } from "bun:test"
import { dockApiHistorySessions, isDockApiRuntimeDirectory, type DockApiSession } from "./dockapi"

const binding = (id: string, directoryPath: string, query = "问题"): DockApiSession => ({
  id: `business-${id}`,
  agentType: "deepinsight",
  query,
  title: query || "新会话",
  openCodeSessionId: `session-${id}`,
  directoryPath,
  openCodeSession: null,
  openCodeStatus: null,
  createdAt: "2026-08-20T10:00:00+08:00",
  updatedAt: "2026-08-20T10:05:00+08:00",
})

describe("DockAPI history sessions", () => {
  test("accepts only the current user stable runtime", () => {
    const root = "D:\\workspace\\u-2"

    expect(isDockApiRuntimeDirectory(root, root)).toBe(true)
    expect(isDockApiRuntimeDirectory(root, "D:/workspace/u-2")).toBe(true)
    expect(isDockApiRuntimeDirectory(root, "D:\\workspace\\u-2\\s-one")).toBe(false)
    expect(isDockApiRuntimeDirectory(root, "D:\\workspace\\u-2\\runs")).toBe(false)
    expect(isDockApiRuntimeDirectory(root, "D:\\workspace\\u-3")).toBe(false)
  })

  test("keeps backend order and does not filter empty-query bindings", () => {
    const root = "D:\\workspace\\u-2"
    const result = dockApiHistorySessions(root, [
      binding("draft", root, ""),
      binding("active", root, "研究问题"),
      binding("legacy", `${root}\\s-legacy`, "旧目录会话"),
      binding("other", "D:\\workspace\\u-3", "其他用户"),
    ])

    expect(result.map((session) => session.id)).toEqual(["session-draft", "session-active"])
    expect(result.map((session) => session.title)).toEqual(["新会话", "研究问题"])
  })
})
