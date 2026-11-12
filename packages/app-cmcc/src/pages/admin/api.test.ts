import { describe, expect, test } from "bun:test"
import { queryPath } from "./api"

describe("management query parameters", () => {
  test("preserves false and zero without exposing undefined filters", () => {
    expect(queryPath("/api/admin/users", { vip: false, page: 0, keyword: "", enabled: undefined })).toBe(
      "/api/admin/users?vip=false&page=0",
    )
  })
  test("encodes Chinese and special characters as values", () => {
    const path = queryPath("/api/dockapi/case-management", { keyword: "巡察 & #1", source: "langgraph", page: 2 })
    const url = new URL(path, "http://localhost")
    expect(url.searchParams.get("keyword")).toBe("巡察 & #1")
    expect(url.searchParams.size).toBe(3)
  })
})
