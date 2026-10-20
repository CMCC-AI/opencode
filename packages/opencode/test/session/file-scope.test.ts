import { describe, expect, test } from "bun:test"
import path from "path"
import os from "os"
import { Effect } from "effect"
import { ProjectV2 } from "@opencode-ai/core/project"
import { SessionFileScope } from "../../src/session/file-scope"
import { SessionID } from "../../src/session/schema"

const runtime = path.join(os.tmpdir(), "session-scope-unit")
const directory = path.join(runtime, "runs", "task-a")
const root = {
  id: SessionID.make("ses_scope_root"),
  projectID: ProjectV2.ID.make("scope-project"),
  directory: runtime,
  metadata: { cmccArtifactDirectory: directory },
}

describe("session file boundary", () => {
  test("includes only files inside the exact task directory", () => {
    const scope = { directory }
    expect(SessionFileScope.contains(scope, runtime, path.join(directory, "output", "report.md"))).toBe(true)
    expect(SessionFileScope.contains(scope, runtime, "runs/task-a/tmp/inspection-workspace/report.json")).toBe(true)
    for (const file of [
      "runs/task-b/report.md",
      "runs/task-a-other/report.md",
      "runs/task-a/../task-b/report.md",
      "runs/task-a",
      undefined,
    ]) {
      expect(SessionFileScope.contains(scope, runtime, file)).toBe(false)
    }
    expect(SessionFileScope.contains(null, runtime, "runs/task-a/report.md")).toBe(false)
    expect(SessionFileScope.contains(undefined, runtime, "src/index.ts")).toBe(true)
  })

  test("nested and retried experts inherit their root's directory", async () => {
    const child = { ...root, id: SessionID.make("ses_scope_child"), parentID: root.id, metadata: undefined }
    const grandchild = { ...child, id: SessionID.make("ses_scope_grandchild"), parentID: child.id }
    const entries = new Map([root, child, grandchild].map((entry) => [entry.id, entry]))
    const scope = await Effect.runPromise(
      SessionFileScope.resolve(grandchild.id, (id) => Effect.succeed(entries.get(id)!)),
    )
    expect(scope).toEqual({ directory })
  })

  test("a child cannot replace its root's directory", async () => {
    const child = {
      ...root,
      id: SessionID.make("ses_scope_child"),
      parentID: root.id,
      metadata: { cmccArtifactDirectory: path.join(runtime, "runs", "task-b") },
    }
    expect(
      await Effect.runPromise(
        SessionFileScope.resolve(child.id, (id) => Effect.succeed(id === root.id ? root : child)),
      ),
    ).toBeNull()
  })

  test("invalid metadata is refused instead of falling back to the shared workspace", async () => {
    for (const value of [
      "",
      null,
      "runs/task-a",
      path.join(runtime, "runs"),
      path.join(directory, "nested"),
      `${directory}/../task-b`,
      path.join(runtime, "..", "outside"),
    ]) {
      expect(
        await Effect.runPromise(
          SessionFileScope.resolve(root.id, () =>
            Effect.succeed({ ...root, metadata: { cmccArtifactDirectory: value } }),
          ),
        ),
      ).toBeNull()
    }
  })

  test("missing, cyclic and cross-workspace ancestors are refused", async () => {
    const child = { ...root, id: SessionID.make("ses_scope_child"), parentID: root.id, metadata: undefined }
    expect(
      await Effect.runPromise(
        SessionFileScope.resolve(child.id, (id) =>
          id === root.id ? Effect.fail(new Error("missing")) : Effect.succeed(child),
        ),
      ),
    ).toBeNull()
    expect(
      await Effect.runPromise(SessionFileScope.resolve(root.id, () => Effect.succeed({ ...root, parentID: root.id }))),
    ).toBeNull()
    expect(
      await Effect.runPromise(
        SessionFileScope.resolve(child.id, (id) =>
          Effect.succeed(id === root.id ? { ...root, directory: path.join(runtime, "other") } : child),
        ),
      ),
    ).toBeNull()
  })

  test("unbound native sessions retain their project scope", async () => {
    expect(
      await Effect.runPromise(
        SessionFileScope.resolve(root.id, () => Effect.succeed({ ...root, metadata: undefined })),
      ),
    ).toBeUndefined()
  })

  test("legacy system-injected boundaries are accepted but ambiguous ones are refused", async () => {
    const entry = { ...root, metadata: undefined }
    const systems = (directories: string[]) =>
      directories.map((value) => `本次会话的独立产物目录是 ${value}，稳定运行目录是 ${runtime}。`)
    expect(
      await Effect.runPromise(
        SessionFileScope.resolve(
          entry.id,
          () => Effect.succeed(entry),
          () => Effect.succeed(systems([directory])),
        ),
      ),
    ).toEqual({ directory })
    expect(
      await Effect.runPromise(
        SessionFileScope.resolve(
          entry.id,
          () => Effect.succeed(entry),
          () => Effect.succeed(systems([directory, path.join(runtime, "runs", "task-b")])),
        ),
      ),
    ).toBeNull()
  })
})
