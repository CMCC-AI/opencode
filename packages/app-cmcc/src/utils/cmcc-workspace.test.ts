import { describe, expect, test } from "bun:test"
import {
  CMCC_ARTIFACT_DIRECTORY_METADATA,
  CMCC_LEGACY_WORKSPACE_RELATIVE,
  CMCC_WORKSPACE_RELATIVE,
  cmccArtifactDirectory,
  cmccArtifactSystemPrompt,
  cmccArtifactWorkspace,
  cmccConversationDirectories,
  cmccConversationWorkspace,
  cmccConversationWorkspaces,
  cmccCreateConversationWorkspace,
  cmccDateWorkspace,
  cmccEnsureWorkspace,
  cmccIsWorkspaceDirectory,
  cmccLegacyWorkspace,
  cmccRuntimeWorkspace,
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

  test("prefers the global directory as the stable runtime", () => {
    expect(cmccRuntimeWorkspace("/Users/levent", "/srv/deep-insight/")).toBe("/srv/deep-insight")
    expect(cmccRuntimeWorkspace("/Users/levent", undefined)).toBe("/Users/levent/Documents/DeepInsight")
    expect(cmccRuntimeWorkspace(undefined, "C:\\DeepInsight\\runtime\\")).toBe("C:/DeepInsight/runtime")
  })

  test("creates unique draft artifact paths below the stable runtime", () => {
    const date = new Date(2026, 7, 19, 17, 25, 39)
    expect(cmccArtifactWorkspace("/srv/deep-insight", date, "4c1e9f8a-08f0-4ca5-b4c9-1024e9ec2016")).toBe(
      "/srv/deep-insight/runs/2026-08-19-17-25-39-4c1e9f8a-08f0-4ca5-b4c9-1024e9ec2016",
    )
    expect(cmccArtifactWorkspace("C:\\DeepInsight", date, "draft/id")).toBe(
      "C:/DeepInsight/runs/2026-08-19-17-25-39-draft-id",
    )
  })

  test("recognizes visible conversation roots and the legacy hidden root", () => {
    expect(
      cmccIsWorkspaceDirectory("/Users/levent/Documents/DeepInsight/2026-07-02/conversation-162504", "/Users/levent"),
    ).toBe(true)
    expect(
      cmccIsWorkspaceDirectory("/Users/levent/Documents/DeepInsight/2026-07-02/conversation-162504", undefined),
    ).toBe(true)
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
      cmccConversationDirectories(
        "C:\\Users\\levent",
        [],
        [
          { directory: "C:/Users/levent/Documents/DeepInsight/2026-07-08/conversation-160000" },
          { directory: "C:\\Users\\levent\\Documents\\DeepInsight\\2026-07-08\\conversation-160000" },
        ],
      ),
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

  test("accepts only absolute artifact metadata within the runtime", () => {
    const key = CMCC_ARTIFACT_DIRECTORY_METADATA
    expect(cmccArtifactDirectory({ [key]: "/srv/runtime/runs/one" }, "/srv/runtime")).toBe("/srv/runtime/runs/one")
    expect(cmccArtifactDirectory({ [key]: "C:\\DeepInsight\\runs\\one" }, "c:/deepinsight")).toBe(
      "C:/DeepInsight/runs/one",
    )
    expect(cmccArtifactDirectory({ [key]: "/srv/runtime-other/runs/one" }, "/srv/runtime")).toBeUndefined()
    expect(cmccArtifactDirectory({ [key]: "/srv/runtime" }, "/srv/runtime")).toBeUndefined()
    expect(cmccArtifactDirectory({ [key]: "/srv/runtime/output/one" }, "/srv/runtime")).toBeUndefined()
    expect(cmccArtifactDirectory({ [key]: "/srv/runtime/runs/../other" }, "/srv/runtime")).toBeUndefined()
    expect(cmccArtifactDirectory({ [key]: "runs/one" }, "/srv/runtime")).toBeUndefined()
    expect(cmccArtifactDirectory({ [key]: 1 }, "/srv/runtime")).toBeUndefined()
    expect(cmccArtifactDirectory(undefined, "/srv/runtime")).toBeUndefined()
  })

  test("adds the independent artifact boundary to the system prompt", () => {
    const prompt = cmccArtifactSystemPrompt("/srv/runtime", "/srv/runtime/runs/one")
    expect(prompt).toContain("/srv/runtime")
    expect(prompt).toContain("/srv/runtime/runs/one")
    expect(prompt).toContain("不得读取或覆盖 runs 下其他会话目录")
  })

  test("deduplicates only concurrent workspace creation", async () => {
    const directory = "/srv/runtime/runs/concurrent"
    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls: string[] = []
    const create = (path: string) => {
      calls.push(path)
      return pending
    }

    const first = cmccEnsureWorkspace(directory, create, "server-a")
    const second = cmccEnsureWorkspace(directory, create, "server-a")
    await Promise.resolve()
    expect(calls).toEqual([directory])
    release?.()
    await expect(Promise.all([first, second])).resolves.toEqual([directory, directory])

    await expect(cmccEnsureWorkspace(directory, create, "server-a")).resolves.toBe(directory)
    expect(calls).toEqual([directory, directory])
  })

  test("retries workspace creation after failure", async () => {
    const directory = "/srv/runtime/runs/retry"
    await expect(
      cmccEnsureWorkspace(directory, () => Promise.reject(new Error("mkdir failed")), "server-retry"),
    ).rejects.toThrow("mkdir failed")
    await expect(cmccEnsureWorkspace(directory, () => undefined, "server-retry")).resolves.toBe(directory)
  })

  test("does not remember an artifact directory as a conversation workspace", async () => {
    const before = cmccConversationWorkspaces()
    await cmccEnsureWorkspace("/srv/runtime/runs/not-remembered", () => undefined, "server-memory")
    expect(cmccConversationWorkspaces()).toEqual(before)
  })
})
