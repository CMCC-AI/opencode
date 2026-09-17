import { expect, test } from "bun:test"
import type { FileNode, Session, SessionStatus } from "@opencode-ai/sdk/v2"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createArtifactFileCatalog } from "@/pages/session/agent-workbench/artifact-file-catalog"

const session = (id: string): Session => ({
  id,
  slug: id,
  directory: "/workspace",
  projectID: "test",
  title: id,
  version: "test",
  time: { created: 1, updated: 2 },
  metadata: { cmccArtifactDirectory: `/workspace/runs/${id}` },
})
const node = (path: string): FileNode => ({
  path,
  name: path.split("/").at(-1)!,
  absolute: `/workspace/${path}`,
  type: "file",
  ignored: false,
})
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}
function deferred() {
  let resolve!: (nodes: FileNode[]) => void
  const promise = new Promise<FileNode[]>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
function setup(list: (path: string) => Promise<FileNode[]>) {
  return createRoot((dispose) => {
    const [state, setState] = createStore({
      root: session("one") as Session | undefined,
      status: { type: "busy" } as SessionStatus,
    })
    const calls: string[] = []
    const catalog = createArtifactFileCatalog({
      root: () => state.root,
      status: () => state.status,
      artifacts: () => [],
      list: (path) => {
        calls.push(path)
        return list(path)
      },
    })
    return { catalog, calls, setState, dispose }
  })
}

test("scans on entry and once at completion, not on every message update", async () => {
  const f = setup(async (path) => [node(`${path}/script.pdf`)])
  try {
    await flush()
    expect(f.calls).toHaveLength(1)
    f.setState("root", "time", "updated", 100)
    await flush()
    expect(f.calls).toHaveLength(1)
    f.setState("status", { type: "idle" })
    await flush()
    expect(f.calls).toHaveLength(2)
    expect(f.catalog.files()[0].filename).toBe("script.pdf")
    expect(f.catalog.loading()).toBe(false)
  } finally {
    f.dispose()
  }
})

test("a stop during the initial scan queues one final scan without polling", async () => {
  const pending = deferred()
  let first = true
  const f = setup(async (path) => {
    if (first) {
      first = false
      return pending.promise
    }
    return [node(`${path}/final.pdf`)]
  })
  try {
    f.setState("status", { type: "idle" })
    pending.resolve([])
    await flush()
    expect(f.calls).toHaveLength(2)
    expect(f.catalog.files()[0].filename).toBe("final.pdf")
  } finally {
    f.dispose()
  }
})

test("old responses cannot populate another session and unmount stops further traversal", async () => {
  const pending = deferred()
  const f = setup(async (path) => (path === "runs/one" ? pending.promise : [node(`${path}/new.md`)]))
  try {
    f.setState("root", session("two"))
    await flush()
    pending.resolve([node("runs/one/old.pdf")])
    await flush()
    expect(f.catalog.files().map((file) => file.path)).toEqual(["runs/two/new.md"])
  } finally {
    f.dispose()
  }
  const other = deferred()
  const g = setup(async () => other.promise)
  g.dispose()
  other.resolve([{ ...node("runs/one/sub"), type: "directory" }])
  await flush()
  expect(g.calls).toHaveLength(1)
})

test("missing metadata does not scan another directory and failures are visible without retries", async () => {
  const f = setup(async () => {
    throw new Error("offline")
  })
  try {
    await flush()
    expect(f.catalog.warnings()[0]).toContain("offline")
    expect(f.catalog.loading()).toBe(false)
    expect(f.calls).toHaveLength(1)
    f.setState("root", "metadata", undefined)
    await flush()
    expect(f.catalog.warnings()[0]).toContain("独立产物目录")
    expect(f.calls).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test("DeepInsight refreshes a proven legacy run on producer completion without polling", async () => {
  const run = "tmp/research-workspace/20260916-0917"
  const f = createRoot((dispose) => {
    const [state, setState] = createStore({ path: run as string | undefined, revision: "write-one", pdf: false })
    const calls: string[] = []
    const catalog = createArtifactFileCatalog({ root: () => session("one"), status: () => ({ type: "busy" }), artifacts: () => [],
      rootPath: () => state.path, revision: () => state.revision, legacyResearch: true,
      list: async (path) => { calls.push(path); return state.pdf ? [node(`${path}/35-report.pdf`)] : [] },
    })
    return { dispose, setState, calls, catalog }
  })
  try {
    await flush()
    expect(f.calls).toEqual([run])
    f.setState("pdf", true)
    await flush()
    expect(f.calls).toHaveLength(1)
    f.setState("revision", "write-one:pdf-completed")
    await flush()
    expect(f.calls).toEqual([run, run])
    expect(f.catalog.files()[0].filename).toBe("35-report.pdf")
    f.setState("path", undefined)
    await flush()
    expect(f.catalog.files()).toEqual([])
    expect(f.calls).toHaveLength(2)
  } finally { f.dispose() }
})
