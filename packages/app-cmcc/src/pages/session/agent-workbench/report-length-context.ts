import { createEffect, createMemo, on, onCleanup, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import type { AgentArtifactContent } from "./artifact-source"
import type { SessionArtifact } from "./model"
import { countReportCharacters } from "./report-length"

export function createReportLength(input: {
  scope: Accessor<string | undefined>
  report: Accessor<SessionArtifact | undefined>
  filename?: string
  revision?: Accessor<number | undefined>
  source: {
    get: (path: string) => AgentArtifactContent | undefined
    load: (path: string, force?: boolean) => Promise<void>
  }
  replaying: Accessor<boolean>
  replayMarkdown: Accessor<string>
}) {
  const [state, setState] = createStore({ loading: false, failed: false })
  const key = createMemo(() => {
    const scope = input.scope()
    const report = input.report()
    if (!scope || report?.filename !== (input.filename ?? "20-report.md")) return undefined
    return JSON.stringify([scope, report.path, report.createdAt, input.revision?.()])
  })
  let generation = 0
  let previousPath: string | undefined

  createEffect(
    on(key, (value) => {
      const current = ++generation
      const report = value ? input.report() : undefined
      if (!report) {
        previousPath = undefined
        setState({ loading: false, failed: false })
        return
      }
      const force = previousPath === report.path
      previousPath = report.path
      setState({ loading: true, failed: false })
      void Promise.resolve()
        .then(async () => {
          if (current !== generation) return
          await input.source.load(report.path)
          // Wait for any old in-flight read before refreshing a rewritten report.
          if (force && current === generation) await input.source.load(report.path, true)
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

  const text = createMemo(() => {
    if (!key() || state.loading || state.failed) return undefined
    const report = input.report()
    const file = report ? input.source.get(report.path) : undefined
    if (!file?.loaded || file.loading || file.error) return undefined
    return file.text
  })
  const actualCount = createMemo(() => {
    const value = text()
    return value?.trim() ? countReportCharacters(value) || undefined : undefined
  })
  const replayText = createMemo(input.replayMarkdown)
  return createMemo(() => {
    const count = actualCount()
    if (count === undefined) return undefined
    return input.replaying() ? countReportCharacters(replayText()) : count
  })
}
