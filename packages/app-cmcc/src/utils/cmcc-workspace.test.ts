import { describe, expect, test } from "bun:test"
import {
  CMCC_LEGACY_WORKSPACE_RELATIVE,
  CMCC_WORKSPACE_RELATIVE,
  cmccConversationDirectories,
  cmccConversationWorkspace,
  cmccCreateConversationWorkspace,
  cmccDateWorkspace,
  cmccIsWorkspaceDirectory,
  cmccLegacyWorkspace,
  cmccWorkspaceLabel,
  cmccWorkspaceRoot,
  cmccWorkspaceSessionPath,
} from "./cmcc-workspace"

describe("cmcc workspace paths", () => {
  test("uses a visible Documents workspace root", () => {
    expect(cmccWorkspaceRoot("/Users/levent/")).toBe(`/Users/levent/${CMCC_WORKSPACE_RELATIVE}`)
    expect(cmccWorkspaceLabel("/Users/levent/Documents/DeepInsight", "/Users/levent")).toBe("~/Documents/DeepInsight")
  })

  test("creates date and conversation paths under the visible root", () => {
    const date = new Date(2026, 6, 2, 16, 25, 4)

    expect(cmccDateWorkspace("/Users/levent", date)).toBe("/Users/levent/Documents/DeepInsight/2026-07-02")
    expect(cmccConversationWorkspace("/Users/levent", date)).toBe(
      "/Users/levent/Documents/DeepInsight/2026-07-02/conversation-162504",
    )
  })

  test("recognizes visible conversation roots and the legacy hidden root", () => {
    expect(
      cmccIsWorkspaceDirectory("/Users/levent/Documents/DeepInsight/2026-07-02/conversation-162504", "/Users/levent"),
    ).toBe(true)
    expect(cmccIsWorkspaceDirectory("/Users/levent/Documents/DeepInsight/2026-07-02/conversation-162504", undefined)).toBe(
      true,
    )
    expect(cmccIsWorkspaceDirectory(cmccLegacyWorkspace("/Users/levent"), "/Users/levent")).toBe(true)
    expect(cmccIsWorkspaceDirectory("/Users/levent/.local/share/opencode", undefined)).toBe(true)
    expect(cmccLegacyWorkspace("/Users/levent")).toBe(`/Users/levent/${CMCC_LEGACY_WORKSPACE_RELATIVE}`)
    expect(cmccIsWorkspaceDirectory("/Users/levent/projects/opencode", "/Users/levent")).toBe(false)
  })

  test("matches Windows native separators from server responses", () => {
    expect(
      cmccIsWorkspaceDirectory(
        "C:\\Users\\levent\\Documents\\DeepInsight\\2026-07-02\\conversation-162504",
        "C:\\Users\\levent",
      ),
    ).toBe(true)
    expect(cmccIsWorkspaceDirectory("C:\\Users\\levent\\Documents\\DeepInsight", "C:/Users/levent")).toBe(true)
    expect(cmccWorkspaceLabel("C:\\Users\\levent\\Documents\\DeepInsight\\2026-07-02", "C:\\Users\\levent")).toBe(
      "~/Documents/DeepInsight/2026-07-02",
    )
    expect(
      cmccConversationDirectories("C:\\Users\\levent", [], [
        { directory: "C:/Users/levent/Documents/DeepInsight/2026-07-08/conversation-160000" },
        { directory: "C:\\Users\\levent\\Documents\\DeepInsight\\2026-07-08\\conversation-160000" },
      ]),
    ).toEqual([
      "C:/Users/levent/Documents/DeepInsight/2026-07-08/conversation-160000",
      "C:/Users/levent/.local/share/opencode",
    ])
    expect(cmccIsWorkspaceDirectory("C:\\Users\\levent\\projects\\opencode", "C:\\Users\\levent")).toBe(false)
  })

  test("builds the global-project path used to discover persisted conversations", () => {
    expect(cmccWorkspaceSessionPath("/Users/levent")).toBe("Users/levent/Documents/DeepInsight")
    expect(cmccWorkspaceSessionPath("C:\\Users\\levent")).toBe("Users/levent/Documents/DeepInsight")
  })

  test("recovers conversation directories from persisted sessions", () => {
    expect(
      cmccConversationDirectories(
        "/Users/levent",
        [],
        [
          { directory: "/Users/levent/Documents/DeepInsight/2026-07-08/conversation-160000" },
          { directory: "/Users/levent/Documents/DeepInsight/2026-07-08/conversation-160000" },
          { directory: "/Users/levent/projects/opencode" },
        ],
      ),
    ).toEqual([
      "/Users/levent/Documents/DeepInsight/2026-07-08/conversation-160000",
      "/Users/levent/.local/share/opencode",
    ])
  })

  test("only remembers a conversation workspace after directory creation succeeds", async () => {
    const calls: string[] = []
    const directory = await cmccCreateConversationWorkspace("/Users/levent", (path) => {
      calls.push(path)
    })

    if (!directory) throw new Error("expected directory")
    expect(directory).toStartWith("/Users/levent/Documents/DeepInsight/")
    expect(calls).toEqual([directory])
  })

  test("does not hide directory creation failures", async () => {
    await expect(
      cmccCreateConversationWorkspace("/Users/levent", () => Promise.reject(new Error("mkdir failed"))),
    ).rejects.toThrow("mkdir failed")
  })
})
