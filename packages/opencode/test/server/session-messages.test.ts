import { afterEach, describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { HttpClientResponse } from "effect/unstable/http"
import { Session as SessionNs } from "@/session/session"
import { MessageV2 } from "../../src/session/message-v2"

import { MessageID, PartID, type SessionID } from "../../src/session/schema"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"
import path from "path"

const it = testEffect(Layer.mergeAll(LayerNode.compile(SessionNs.node), httpApiLayer))

const model = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test"),
}

afterEach(async () => {
  await disposeAllInstances()
})

const withoutWatcher = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  if (process.platform !== "win32") return effect
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER
      process.env.OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER = "true"
      return previous
    }),
    () => effect,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env.OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER
        else process.env.OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER = previous
      }),
  )
}

const sessionScoped = Effect.acquireRelease(SessionNs.use.create({}), (session) =>
  SessionNs.use.remove(session.id).pipe(Effect.ignore),
)

const fill = Effect.fn("SessionMessagesTest.fill")(function* (
  sessionID: SessionID,
  count: number,
  time = (i: number) => Date.now() + i,
) {
  const session = yield* SessionNs.Service
  return yield* Effect.forEach(
    Array.from({ length: count }, (_, i) => i),
    (i) =>
      Effect.gen(function* () {
        const id = MessageID.ascending()
        yield* session.updateMessage({
          id,
          sessionID,
          role: "user",
          time: { created: time(i) },
          agent: "test",
          model,
          tools: {},
        } satisfies SessionV1.User)
        yield* session.updatePart({
          id: PartID.ascending(),
          sessionID,
          messageID: id,
          type: "text",
          text: `m${i}`,
        } satisfies SessionV1.TextPart)
        return id
      }),
  )
})

function request(path: string) {
  return TestInstance.pipe(Effect.flatMap((test) => requestInDirectory(path, test.directory)))
}

function json<T>(response: HttpClientResponse.HttpClientResponse) {
  return response.json.pipe(Effect.map((body) => body as T))
}

describe("session messages endpoint", () => {
  it.instance(
    "filters legacy cross-task diffs in lists, pages, individual messages and child sessions",
    withoutWatcher(
      Effect.gen(function* () {
        const tmp = yield* TestInstance
        const service = yield* SessionNs.Service
        const session = yield* sessionScoped
        const directory = path.join(tmp.directory, "runs", "task-a")
        yield* service.setMetadata({ sessionID: session.id, metadata: { cmccArtifactDirectory: directory } })
        const ids = yield* fill(session.id, 2)
        const messageID = ids[1]!
        const stored = (yield* service.messages({ sessionID: session.id })).find(
          (entry) => entry.info.id === messageID,
        )!
        if (stored.info.role !== "user") throw new Error("Expected user message")
        const own = { file: "runs/task-a/report.md", additions: 1, deletions: 0 }
        const foreign = { file: "runs/task-b/inspection.json", additions: 140, deletions: 0 }
        yield* service.updateMessage({
          ...stored.info,
          system: `本次会话的独立产物目录是 ${directory}，稳定运行目录是 ${tmp.directory}。`,
          summary: { diffs: [own, foreign] },
        })
        for (const suffix of ["", "?limit=1"]) {
          const response = yield* request(`/session/${session.id}/message${suffix}`)
          expect(response.status).toBe(200)
          const body = yield* json<SessionV1.WithParts[]>(response)
          const user = body.find((item) => item.info.id === messageID)?.info
          if (user?.role !== "user") throw new Error("Expected scoped user message")
          expect(user.summary?.diffs).toEqual([own])
        }
        const detail = yield* request(`/session/${session.id}/message/${messageID}`)
        expect(detail.status).toBe(200)
        const user = (yield* json<SessionV1.WithParts>(detail)).info
        if (user.role !== "user") throw new Error("Expected scoped message")
        expect(user.summary?.diffs).toEqual([own])
        const diff = yield* request(`/session/${session.id}/diff?messageID=${messageID}`)
        expect(diff.status).toBe(200)
        expect(yield* diff.json).toEqual([own])

        const child = yield* service.create({ parentID: session.id })
        const childUser = yield* service.updateMessage({
          ...stored.info,
          id: MessageID.ascending(),
          sessionID: child.id,
          summary: { diffs: [own, foreign] },
        })
        const childResponse = yield* request(`/session/${child.id}/message/${childUser.id}`)
        expect(childResponse.status).toBe(200)
        const childInfo = (yield* json<SessionV1.WithParts>(childResponse)).info
        if (childInfo.role !== "user") throw new Error("Expected child user message")
        expect(childInfo.summary?.diffs).toEqual([own])

        // Legacy sessions can recover their boundary from the persisted injected system field.
        yield* service.setMetadata({ sessionID: session.id, metadata: {} })
        const legacy = yield* request(`/session/${session.id}/diff?messageID=${messageID}`)
        expect(legacy.status).toBe(200)
        expect(yield* legacy.json).toEqual([own])
        yield* service.updateMessage({
          ...stored.info,
          id: MessageID.ascending(),
          system: `本次会话的独立产物目录是 ${path.join(tmp.directory, "runs", "task-b")}，稳定运行目录是 ${tmp.directory}。`,
        })
        const ambiguous = yield* request(`/session/${session.id}/diff?messageID=${messageID}`)
        expect(ambiguous.status).toBe(200)
        expect(yield* ambiguous.json).toEqual([])
        const refused = yield* requestInDirectory(`/session/${session.id}/revert`, tmp.directory, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messageID }),
        })
        expect(refused.status).toBe(400)
        expect(yield* refused.json).toMatchObject({
          kind: "session_file_scope",
          message: "无法确认当前任务的文件目录，已取消回滚操作。",
        })
        const unchanged = (yield* service.messages({ sessionID: session.id })).find(
          (entry) => entry.info.id === messageID,
        )!.info
        if (unchanged.role !== "user") throw new Error("Expected stored user message")
        expect(unchanged.summary?.diffs).toEqual([own, foreign])
      }),
    ),
    { git: true },
    { timeout: 180000 },
  )

  it.instance(
    "returns cursor headers for older pages",
    withoutWatcher(
      Effect.gen(function* () {
        const session = yield* sessionScoped
        const ids = yield* fill(session.id, 5)

        const a = yield* request(`/session/${session.id}/message?limit=2`)
        expect(a.status).toBe(200)
        const aBody = yield* json<SessionV1.WithParts[]>(a)
        expect(aBody.map((item) => item.info.id)).toEqual(ids.slice(-2))
        const cursor = a.headers["x-next-cursor"]
        expect(cursor).toBeTruthy()
        expect(a.headers["link"]).toContain('rel="next"')

        const b = yield* request(`/session/${session.id}/message?limit=2&before=${encodeURIComponent(cursor!)}`)
        expect(b.status).toBe(200)
        const bBody = yield* json<SessionV1.WithParts[]>(b)
        expect(bBody.map((item) => item.info.id)).toEqual(ids.slice(-4, -2))
      }),
    ),
    { git: true },
  )

  it.instance(
    "keeps full-history responses when limit is omitted",
    withoutWatcher(
      Effect.gen(function* () {
        const session = yield* sessionScoped
        const ids = yield* fill(session.id, 3)

        const res = yield* request(`/session/${session.id}/message`)
        expect(res.status).toBe(200)
        const body = yield* json<SessionV1.WithParts[]>(res)
        expect(body.map((item) => item.info.id)).toEqual(ids)
      }),
    ),
    { git: true },
  )

  it.instance(
    "rejects invalid cursors and missing sessions",
    withoutWatcher(
      Effect.gen(function* () {
        const session = yield* sessionScoped

        const bad = yield* request(`/session/${session.id}/message?limit=2&before=bad`)
        expect(bad.status).toBe(400)

        const miss = yield* request(`/session/ses_missing/message?limit=2`)
        expect(miss.status).toBe(404)
      }),
    ),
    { git: true },
  )

  it.instance(
    "does not truncate large legacy limit requests",
    withoutWatcher(
      Effect.gen(function* () {
        const session = yield* sessionScoped
        yield* fill(session.id, 520)

        const res = yield* request(`/session/${session.id}/message?limit=510`)
        expect(res.status).toBe(200)
        const body = yield* json<SessionV1.WithParts[]>(res)
        expect(body).toHaveLength(510)
      }),
    ),
    { git: true },
  )

  it.instance(
    "accepts directory query used by workspace routing",
    withoutWatcher(
      Effect.gen(function* () {
        const tmp = yield* TestInstance
        const session = yield* sessionScoped
        yield* fill(session.id, 1)

        const res = yield* request(
          `/session/${session.id}/message?limit=80&directory=${encodeURIComponent(tmp.directory)}`,
        )
        expect(res.status).toBe(200)
        const body = yield* json<unknown[]>(res)
        expect(Array.isArray(body)).toBe(true)
        expect(body).toHaveLength(1)
      }),
    ),
    { git: true },
  )
})
