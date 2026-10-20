import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer, Context, Schema } from "effect"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Snapshot } from "@/snapshot"
import { Session } from "./session"
import { SessionID, MessageID } from "./schema"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { SessionFileScope } from "./file-scope"
import { Database } from "@opencode-ai/core/database/database"
import { MessageTable } from "@opencode-ai/core/session/sql"
import { and, eq, like, sql } from "drizzle-orm"

function unquoteGitPath(input: string) {
  if (!input.startsWith('"')) return input
  if (!input.endsWith('"')) return input
  const body = input.slice(1, -1)
  const bytes: number[] = []

  for (let i = 0; i < body.length; i++) {
    const char = body[i]!
    if (char !== "\\") {
      bytes.push(char.charCodeAt(0))
      continue
    }

    const next = body[i + 1]
    if (!next) {
      bytes.push("\\".charCodeAt(0))
      continue
    }

    if (next >= "0" && next <= "7") {
      const chunk = body.slice(i + 1, i + 4)
      const match = chunk.match(/^[0-7]{1,3}/)
      if (!match) {
        bytes.push(next.charCodeAt(0))
        i++
        continue
      }
      bytes.push(parseInt(match[0], 8))
      i += match[0].length
      continue
    }

    const escaped =
      next === "n"
        ? "\n"
        : next === "r"
          ? "\r"
          : next === "t"
            ? "\t"
            : next === "b"
              ? "\b"
              : next === "f"
                ? "\f"
                : next === "v"
                  ? "\v"
                  : next === "\\" || next === '"'
                    ? next
                    : undefined

    bytes.push((escaped ?? next).charCodeAt(0))
    i++
  }

  return Buffer.from(bytes).toString()
}

export interface Interface {
  readonly summarize: (input: { sessionID: SessionID; messageID: MessageID }) => Effect.Effect<void>
  readonly diff: (input: { sessionID: SessionID; messageID?: MessageID }) => Effect.Effect<Snapshot.FileDiff[]>
  readonly computeDiff: (input: {
    sessionID: SessionID
    messages: SessionV1.WithParts[]
  }) => Effect.Effect<Snapshot.FileDiff[]>
  readonly fileScope: (sessionID: SessionID) => Effect.Effect<SessionFileScope.Scope>
  readonly filterMessages: (input: {
    sessionID: SessionID
    messages: SessionV1.WithParts[]
  }) => Effect.Effect<SessionV1.WithParts[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionSummary") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const snapshot = yield* Snapshot.Service
    const events = yield* EventV2Bridge.Service
    const config = yield* Config.Service
    const { db } = yield* Database.Service

    const legacySystems = Effect.fn("SessionSummary.legacySystems")(function* (sessionID: SessionID) {
      const system = sql<string>`json_extract(${MessageTable.data}, '$.system')`
      const rows = yield* db
        .selectDistinct({ system })
        .from(MessageTable)
        .where(
          and(
            eq(MessageTable.session_id, sessionID),
            eq(sql<string>`json_extract(${MessageTable.data}, '$.role')`, "user"),
            like(system, "%本次会话的独立产物目录是 %"),
          ),
        )
        .all()
        .pipe(Effect.orDie)
      return rows.map((row) => row.system)
    })

    const fileScope = (sessionID: SessionID) => SessionFileScope.resolve(sessionID, sessions.get, legacySystems)

    const scopedDiffs = (scope: SessionFileScope.Scope, worktree: string, diffs: Snapshot.FileDiff[]) =>
      diffs
        .map((item) => (item.file === undefined ? item : { ...item, file: unquoteGitPath(item.file) }))
        .filter((item) => SessionFileScope.contains(scope, worktree, item.file))

    const filterMessages = Effect.fn("SessionSummary.filterMessages")(function* (input: {
      sessionID: SessionID
      messages: SessionV1.WithParts[]
    }) {
      const scope = yield* fileScope(input.sessionID)
      const { worktree } = yield* InstanceState.context
      if (scope === undefined) return input.messages
      return input.messages.map((entry) => ({
        info:
          entry.info.role === "user" && entry.info.summary?.diffs
            ? {
                ...entry.info,
                summary: { ...entry.info.summary, diffs: scopedDiffs(scope, worktree, entry.info.summary.diffs) },
              }
            : entry.info,
        parts: entry.parts.map((part) =>
          part.type === "patch"
            ? { ...part, files: part.files.filter((file) => SessionFileScope.contains(scope, worktree, file)) }
            : part,
        ),
      }))
    })

    const computeDiff = Effect.fn("SessionSummary.computeDiff")(function* (input: {
      sessionID: SessionID
      messages: SessionV1.WithParts[]
    }) {
      const scope = yield* fileScope(input.sessionID)
      if (scope === null) return []
      let from: string | undefined
      let to: string | undefined
      for (const item of input.messages) {
        if (!from) {
          for (const part of item.parts) {
            if (part.type === "step-start" && part.snapshot) {
              from = part.snapshot
              break
            }
          }
        }
        for (const part of item.parts) {
          if (part.type === "step-finish" && part.snapshot) to = part.snapshot
        }
      }
      if (from && to) return yield* snapshot.diffFull(from, to, scope)
      return []
    })

    const summarize = Effect.fn("SessionSummary.summarize")(function* (input: {
      sessionID: SessionID
      messageID: MessageID
    }) {
      yield* sessions.setSummary({
        sessionID: input.sessionID,
        summary: {
          additions: 0,
          deletions: 0,
          files: 0,
        },
      })
      yield* events.publish(Session.Event.Diff, { sessionID: input.sessionID, diff: [] })
      if ((yield* config.get()).snapshot === false) return
      const all = yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
      if (!all.length) return

      const messages = all.filter(
        (m) => m.info.id === input.messageID || (m.info.role === "assistant" && m.info.parentID === input.messageID),
      )
      const target = messages.find((m) => m.info.id === input.messageID)
      if (!target || target.info.role !== "user") return
      const msgDiffs = yield* computeDiff({ sessionID: input.sessionID, messages })
      target.info.summary = { ...target.info.summary, diffs: msgDiffs }
      yield* sessions.updateMessage(target.info)
    })

    const diff = Effect.fn("SessionSummary.diff")(function* (input: { sessionID: SessionID; messageID?: MessageID }) {
      if (!input.messageID) return []
      const message = (yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)).find(
        (item) => item.info.id === input.messageID,
      )
      if (!message || message.info.role !== "user") return []
      const diffs = message.info.summary?.diffs ?? []
      const scope = yield* fileScope(input.sessionID)
      const { worktree } = yield* InstanceState.context
      return scopedDiffs(scope, worktree, diffs)
    })

    return Service.of({ summarize, diff, computeDiff, fileScope, filterMessages })
  }),
)

export const DiffInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
})
export type DiffInput = Schema.Schema.Type<typeof DiffInput>

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Session.node, Snapshot.node, EventV2Bridge.node, Config.node, Database.node],
})

export * as SessionSummary from "./summary"
