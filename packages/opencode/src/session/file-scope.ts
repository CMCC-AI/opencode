import path from "path"
import { Effect, Schema } from "effect"
import type { Session } from "./session"
import type { SessionID } from "./schema"

export type Scope = { directory: string } | null | undefined
export class BoundaryError extends Schema.TaggedErrorClass<BoundaryError>()("SessionFileScopeError", {
  message: Schema.String,
}) {}
type Entry = Pick<Session.Info, "id" | "parentID" | "directory" | "projectID" | "metadata">

function artifactDirectory(runtime: string, value: unknown) {
  if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0")) return
  if (
    value
      .replaceAll("\\", "/")
      .split("/")
      .some((part) => part === ".." || part === ".")
  )
    return
  const directory = path.resolve(value)
  if (path.relative(path.join(runtime, "runs"), path.dirname(directory)) !== "") return
  return directory
}

// undefined preserves native project sessions; null refuses an unresolved task boundary.
export const resolve = Effect.fn("SessionFileScope.resolve")(function* (
  sessionID: SessionID,
  get: (id: SessionID) => Effect.Effect<Entry, unknown>,
  systems?: (id: SessionID) => Effect.Effect<readonly string[], unknown>,
): Effect.fn.Return<Scope> {
  const seen = new Set<string>()
  const directories: string[] = []
  let current = yield* get(sessionID).pipe(Effect.orElseSucceed(() => undefined))
  if (!current) return null
  const runtime = path.resolve(current.directory)
  const project = current.projectID
  while (current) {
    if (seen.has(current.id) || seen.size >= 128) return null
    seen.add(current.id)
    if (current.projectID !== project || path.relative(runtime, current.directory) !== "") return null
    if (current.metadata && Object.hasOwn(current.metadata, "cmccArtifactDirectory")) {
      const directory = artifactDirectory(runtime, current.metadata.cmccArtifactDirectory)
      if (!directory) return null
      directories.push(directory)
    }
    if (!current.parentID) break
    current = yield* get(current.parentID).pipe(Effect.orElseSucceed(() => undefined))
    if (!current) return null
  }
  if (!directories.length && systems) {
    const history = yield* systems(current!.id).pipe(Effect.orElseSucceed(() => undefined))
    if (!history) return null
    for (const system of history) {
      if (!system.includes("本次会话的独立产物目录是 ")) continue
      const match = /^本次会话的独立产物目录是 (.+)，稳定运行目录是 (.+)。$/m.exec(system)
      if (!match) return null
      const directory = artifactDirectory(runtime, match[1])
      if (!directory || path.relative(runtime, match[2]!) !== "") return null
      directories.push(directory)
    }
  }
  if (!directories.length) return
  if (directories.some((directory) => path.relative(directories[0]!, directory) !== "")) return null
  return { directory: directories[0]! }
})

export function contains(scope: Scope, worktree: string, file: string | undefined) {
  if (scope === undefined) return true
  if (!scope || !file || file.includes("\0")) return false
  if (
    file
      .replaceAll("\\", "/")
      .split("/")
      .some((part) => part === "..")
  )
    return false
  const absolute = path.isAbsolute(file) ? path.resolve(file) : path.resolve(worktree, file)
  const relative = path.relative(scope.directory, absolute)
  return !!relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export * as SessionFileScope from "./file-scope"
