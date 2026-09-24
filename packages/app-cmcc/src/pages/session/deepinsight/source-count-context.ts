import { createEffect, createMemo, on, onCleanup, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import type { AgentArtifactContent } from "../agent-workbench/artifact-source"
import type { SessionArtifact } from "../agent-workbench/model"
import { countDeepInsightSources } from "./source-count"

export function createDeepInsightSourceCount(input: {
  scope: Accessor<string | undefined>
  reference: Accessor<SessionArtifact | undefined>
  revision: Accessor<string | number | undefined>
  visible: Accessor<boolean>
  source: {
    get: (path: string) => AgentArtifactContent | undefined
    load: (path: string, force?: boolean) => Promise<void>
  }
}) {
  const [state, setState] = createStore({ loading: false, failed: false })
  const key = createMemo(() => {
    const scope = input.scope()
    const reference = input.reference()
    return scope && reference
      ? JSON.stringify([scope, reference.path, reference.createdAt, input.revision()])
      : undefined
  })
  let generation = 0
  let previousPath: string | undefined
  createEffect(
    on(key, (value) => {
      const current = ++generation
      const reference = value ? input.reference() : undefined
      if (!reference) {
        previousPath = undefined
        setState({ loading: false, failed: false })
        return
      }
      const force = previousPath === reference.path
      previousPath = reference.path
      setState({ loading: true, failed: false })
      void Promise.resolve()
        .then(async () => {
          if (current !== generation) return
          await input.source.load(reference.path)
          if (force && current === generation) await input.source.load(reference.path, true)
        })
        .catch(() => {
          if (current === generation) setState("failed", true)
        })
        .finally(() => {
          if (current === generation) setState("loading", false)
        })
    }),
  )
  onCleanup(() => {
    generation += 1
  })
  const count = createMemo(() => {
    if (!key() || state.loading || state.failed) return undefined
    const reference = input.reference()
    const file = reference ? input.source.get(reference.path) : undefined
    return file?.loaded && !file.loading && !file.error && file.text !== undefined
      ? countDeepInsightSources(file.text)
      : undefined
  })
  return createMemo(() => (input.visible() ? count() : undefined))
}
