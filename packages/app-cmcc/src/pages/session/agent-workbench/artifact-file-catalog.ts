import type { FileNode, Session, SessionStatus } from "@opencode-ai/sdk/v2"
import { createEffect, createMemo, on, onCleanup, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import type { SessionArtifact } from "./model"
import { mergeSessionArtifactFiles, scanSessionArtifactFiles, sessionArtifactRoot } from "./artifact-files"

export function createArtifactFileCatalog(input: {
  root: Accessor<Session | undefined>
  status: Accessor<SessionStatus | undefined>
  artifacts: Accessor<readonly SessionArtifact[]>
  list: (path: string) => Promise<FileNode[]>
  rootPath?: Accessor<string | undefined>
  legacyResearch?: boolean
  revision?: Accessor<string>
}) {
  const [state, setState] = createStore({ paths: [] as string[], loading: false, warnings: [] as string[] })
  const scope = createMemo(() => {
    const root = input.root()
    const path = root
      ? input.rootPath
        ? input.rootPath()
        : sessionArtifactRoot(root.directory, root.metadata)
      : undefined
    return root && path ? { id: root.id, directory: root.directory, path } : undefined
  })
  const key = createMemo(() => {
    const value = scope()
    return value ? JSON.stringify([value.id, value.directory, value.path]) : undefined
  })
  const busy = createMemo(() => input.status()?.type === "busy" || input.status()?.type === "retry")
  let generation = 0
  let pending: Promise<void> | undefined
  let queued = false

  const refresh = () => {
    const source = scope()
    if (!source) return
    if (pending) {
      queued = true
      return
    }
    const current = generation
    const list = input.list
    setState("loading", true)
    const task = scanSessionArtifactFiles({
      directory: source.directory,
      root: source.path,
      legacyResearch: input.legacyResearch,
      list,
      isCurrent: () => generation === current,
    })
      .then((result) => {
        if (generation === current) setState({ paths: result.paths, warnings: result.warnings })
      })
      .catch((error: unknown) => {
        if (generation === current) {
          setState("warnings", [`产物目录读取失败：${error instanceof Error ? error.message : String(error)}`])
        }
      })
      .finally(() => {
        if (generation !== current) return
        pending = undefined
        setState("loading", false)
        if (!queued) return
        queued = false
        refresh()
      })
    pending = task
  }

  createEffect(
    on(
      () => ({ key: key(), busy: busy(), revision: input.revision?.() }),
      (next, previous) => {
        if (next.key !== previous?.key) {
          generation += 1
          pending = undefined
          queued = false
          setState({ paths: [], loading: false, warnings: [] })
          refresh()
          return
        }
        if ((previous?.busy && !next.busy) || (previous && next.revision !== previous.revision)) refresh()
      },
    ),
  )
  onCleanup(() => {
    generation += 1
  })

  return {
    files: createMemo(() =>
      mergeSessionArtifactFiles({
        artifacts: input.artifacts(),
        paths: state.paths,
        rootSessionId: input.root()?.id ?? "",
      }),
    ),
    loading: () => state.loading,
    warnings: () =>
      input.root() && !scope() ? ["当前会话缺少有效的独立产物目录，仅展示已有工具记录中的文件"] : state.warnings,
  }
}
