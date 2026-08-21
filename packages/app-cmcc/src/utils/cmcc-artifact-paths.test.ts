import { describe, expect, test } from "bun:test"
import type { FileNode } from "@opencode-ai/sdk/v2"
import {
  cmccScanWorkspaceArtifactPaths,
  cmccScopedArtifactPath,
  cmccWorkspaceRelativePath,
} from "./cmcc-artifact-paths"

describe("CMCC artifact paths", () => {
  test("keeps artifact paths inside the current session root", () => {
    const runtime = "/srv/opencode/workspaces"
    const root = "runs/session-a"

    expect(cmccWorkspaceRelativePath(runtime, `${runtime}/${root}`)).toBe(root)
    expect(cmccScopedArtifactPath(runtime, root, `${runtime}/${root}/report.pdf`)).toBe(
      "runs/session-a/report.pdf",
    )
    expect(cmccScopedArtifactPath(runtime, root, "runs/session-a/output/result.csv")).toBe(
      "runs/session-a/output/result.csv",
    )
    expect(cmccScopedArtifactPath(runtime, root, `${runtime}/runs/session-b/report.pdf`)).toBeUndefined()
    expect(cmccScopedArtifactPath(runtime, root, "../session-b/report.pdf")).toBeUndefined()
  })

  test("normalizes Windows paths without accepting sibling sessions", () => {
    const runtime = "C:\\opencode\\workspaces"
    const root = "runs/session-a"

    expect(cmccScopedArtifactPath(runtime, root, "C:\\opencode\\workspaces\\runs\\session-a\\report.docx")).toBe(
      "runs/session-a/report.docx",
    )
    expect(
      cmccScopedArtifactPath(runtime, root, "C:\\opencode\\workspaces\\runs\\session-b\\report.docx"),
    ).toBeUndefined()
  })

  test("scans only the dedicated session root and descends its directories", async () => {
    const calls: string[] = []
    const entries: Record<string, FileNode[]> = {
      "runs/session-a": [
        file("runs/session-a/report.md"),
        directory("runs/session-a/nested"),
      ],
      "runs/session-a/nested": [file("runs/session-a/nested/raw.bin")],
    }

    const paths = await cmccScanWorkspaceArtifactPaths(
      async (path) => {
        calls.push(path)
        return entries[path] ?? []
      },
      ["runs/session-a"],
      true,
    )

    expect(calls).toEqual(["runs/session-a", "runs/session-a/nested"])
    expect(paths).toEqual(["runs/session-a/nested/raw.bin", "runs/session-a/report.md"])
  })
})

function file(path: string): FileNode {
  return { name: path.split("/").at(-1) ?? path, path, absolute: path, type: "file", ignored: false }
}

function directory(path: string): FileNode {
  return { name: path.split("/").at(-1) ?? path, path, absolute: path, type: "directory", ignored: false }
}
