import { createEffect, createMemo, on, type Accessor } from "solid-js"
import type { AgentArtifactSource } from "../agent-workbench/artifact-source"
import { parseDeepInsightRoute } from "./data"

export function createDeepInsightRoute(input: {
  path: Accessor<string | undefined>
  revision: Accessor<string>
  source: Pick<AgentArtifactSource, "get"> & { load: (path: string, force?: boolean) => Promise<void> }
}) {
  createEffect(
    on(
      () => JSON.stringify([input.path(), input.revision()]),
      () => {
        const path = input.path()
        if (path) void input.source.load(path, true).catch(() => undefined)
      },
    ),
  )
  return createMemo(() => {
    const path = input.path()
    const file = path ? input.source.get(path) : undefined
    return file?.text ? parseDeepInsightRoute(file.text) : undefined
  })
}
