import { describe, expect, test } from "bun:test"
import { canManageUser, queryPath, userTypeLabel } from "./api"

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

describe("administrator user boundaries", () => {
  test("ordinary administrators can only configure ordinary users", () => {
    expect(canManageUser("admin", "user")).toBe(true)
    expect(canManageUser("admin", "admin")).toBe(false)
    expect(canManageUser("admin", "super_admin")).toBe(false)
    expect(canManageUser("user", "user")).toBe(false)
    expect(canManageUser(undefined, "user")).toBe(false)
  })

  test("super admin retains management and has a distinct display label", () => {
    for (const target of ["user", "admin", "super_admin"] as const)
      expect(canManageUser("super_admin", target)).toBe(true)
    expect(userTypeLabel("super_admin")).toBe("超级管理员")
    expect(userTypeLabel("admin")).toBe("管理员")
  })
})
