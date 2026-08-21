import { describe, expect, test } from "bun:test"
import { dockApiHistorySessions, isDockApiSessionDirectory, type DockApiSession } from "./dockapi"

const binding = (id: string, directoryPath: string, query = "问题"): DockApiSession => ({
  id: `business-${id}`,
  agentType: "DeepInsight",
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
  test("accepts only direct s-prefixed children of the current user directory", () => {
    const root = "D:\\workspace\\u-2"

    expect(isDockApiSessionDirectory(root, "D:\\workspace\\u-2\\s-one")).toBe(true)
    expect(isDockApiSessionDirectory(root, "D:/workspace/u-2/s-two")).toBe(true)
    expect(isDockApiSessionDirectory(root, root)).toBe(false)
    expect(isDockApiSessionDirectory(root, "D:\\workspace\\u-2\\other")).toBe(false)
    expect(isDockApiSessionDirectory(root, "D:\\workspace\\u-2\\s-one\\nested")).toBe(false)
    expect(isDockApiSessionDirectory(root, "D:\\workspace\\u-3\\s-one")).toBe(false)
  })

  test("keeps backend order and does not filter empty-query bindings", () => {
    const root = "D:\\workspace\\u-2"
    const result = dockApiHistorySessions(root, [
      binding("draft", `${root}\\s-draft`, ""),
      binding("active", `${root}\\s-active`, "研究问题"),
      binding("legacy", root, "旧会话"),
      binding("other", "D:\\workspace\\u-3\\s-other", "其他用户"),
    ])

    expect(result.map((session) => session.id)).toEqual(["session-draft", "session-active"])
    expect(result.map((session) => session.title)).toEqual(["新会话", "研究问题"])
    expect(result.every((session) => session.directory.includes("\\s-"))).toBe(true)
  })
})
