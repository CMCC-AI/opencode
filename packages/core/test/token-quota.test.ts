import { expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { eq, sql } from "drizzle-orm"
import { LLMEvent, Usage } from "@opencode-ai/llm"
import { TokenQuota } from "../src/token-quota/client"
import { QuotaOutboxTable } from "../src/token-quota/sql"
import { Database } from "../src/database/database"
import { tmpdir } from "./fixture/tmpdir"
import { RequestExecutor } from "@opencode-ai/llm/route"
import { HttpClientRequest } from "effect/unstable/http"

type Call = {
  callId: string
  userId: number
  sessionId: string
  rootSessionId: string
  providerId: string
  modelId: string
  estimatedInputTokens: number
  maxOutputTokens: number
}
type Finish = { outcome: string; usage?: { total: number } }

async function fixture(
  work: (state: {
    run: <A, E>(effect: Effect.Effect<A, E, TokenQuota.Service | Database.Service>) => Promise<A>
    results: Map<string, Finish>
    calls: Map<string, Call>
    mode: { reject: boolean; finishUnavailable: boolean; finishFailures: Set<string> }
  }) => Promise<void>,
) {
  await using tmp = await tmpdir()
  const saved = {
    enabled: process.env.OPENCODE_DOCKAPI_QUOTA_ENABLED,
    url: process.env.OPENCODE_DOCKAPI_URL,
    token: process.env.DOCKAPI_QUOTA_SERVICE_TOKEN,
  }
  const calls = new Map<string, Call>()
  const results = new Map<string, Finish>()
  const mode = { reject: false, finishUnavailable: false, finishFailures: new Set<string>() }
  const token = "quota-test-service-token-01234567890123456789"
  const response = (data: unknown, code = 200) =>
    Response.json({ code, data, message: code === 429 ? "本周 Token 额度不足" : "test response" }, { status: code })
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname
      if (path === "/api/user/profile") return response({ user: { id: 7 } })
      expect(request.headers.get("x-dockapi-service-token")).toBe(token)
      if (path === "/api/internal/token-quota/reserve") {
        const body = (await request.json()) as Call
        if (mode.reject) return response(null, 429)
        calls.set(body.callId, body)
        return response({
          callId: body.callId,
          status: results.get(body.callId)?.outcome === "settled" ? "settled" : "reserved",
          maxOutputTokens: body.maxOutputTokens,
          reservedTokens: body.estimatedInputTokens + body.maxOutputTokens,
          weekStart: 1,
        })
      }
      if (path.endsWith("/heartbeat")) return response(null)
      if (path.endsWith("/finish")) {
        const id = path.split("/").at(-2)!
        if (mode.finishUnavailable || mode.finishFailures.has(id)) return response(null, 503)
        results.set(id, (await request.json()) as Finish)
        return response(null)
      }
      return response(null, 404)
    },
  })
  process.env.OPENCODE_DOCKAPI_QUOTA_ENABLED = "true"
  process.env.OPENCODE_DOCKAPI_URL = server.url.origin
  process.env.DOCKAPI_QUOTA_SERVICE_TOKEN = token
  const db = Database.layerFromPath(tmp.path + "/quota.sqlite")
  const layer = TokenQuota.layer.pipe(Layer.provideMerge(db))
  try {
    await work({
      calls,
      results,
      mode,
      run: (effect) => Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.scoped)),
    })
  } finally {
    server.stop(true)
    for (const [key, value] of Object.entries({
      OPENCODE_DOCKAPI_QUOTA_ENABLED: saved.enabled,
      OPENCODE_DOCKAPI_URL: saved.url,
      DOCKAPI_QUOTA_SERVICE_TOKEN: saved.token,
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const input = {
  sessionID: "ses_quota_test",
  providerID: "test",
  modelID: "model",
  input: { messages: ["hello"], tools: [] },
  maxOutputTokens: 32000,
}

test("invalid quota configuration cannot silently disable admission", () => {
  const saved = process.env.OPENCODE_DOCKAPI_QUOTA_ENABLED
  try {
    process.env.OPENCODE_DOCKAPI_QUOTA_ENABLED = "invalid"
    expect(() => TokenQuota.settings()).toThrow("must be true or false")
  } finally {
    if (saved === undefined) delete process.env.OPENCODE_DOCKAPI_QUOTA_ENABLED
    else process.env.OPENCODE_DOCKAPI_QUOTA_ENABLED = saved
  }
})

test(
  "failed settlement rows do not starve later queued records",
  () =>
    fixture(async (state) => {
      await state.run(
        Effect.gen(function* () {
          const quota = yield* TokenQuota.Service
          const db = (yield* Database.Service).db
          const rows = Array.from({ length: 101 }, (_, index) => {
            const id = index === 100 ? "ready-call" : `blocked-${index}`
            if (index < 100) state.mode.finishFailures.add(id)
            return {
              call_id: id,
              request_json: JSON.stringify({
                callId: id,
                userId: 7,
                sessionId: input.sessionID,
                rootSessionId: input.sessionID,
                providerId: "test",
                modelId: "model",
                estimatedInputTokens: 100,
                maxOutputTokens: 32000,
              }),
              dispatched: 1,
              finish_json: JSON.stringify({ outcome: "unknown" }),
              time_updated: index,
            }
          })
          yield* db.insert(QuotaOutboxTable).values(rows).run()
          yield* quota.replay
          yield* quota.replay
          expect(state.results.has("ready-call")).toBe(true)
        }),
      )
    }),
  15000,
)

test(
  "sub-agent calls inherit the authenticated root user",
  () =>
    fixture(async (state) => {
      await state.run(
        Effect.gen(function* () {
          const quota = yield* TokenQuota.Service
          const db = (yield* Database.Service).db
          yield* quota.bind(input.sessionID, 7, true)
          yield* db.run(
            sql`INSERT INTO project (id,worktree,time_created,time_updated,sandboxes) VALUES ('quota-project','/quota',1,1,'[]')`,
          )
          yield* db.run(sql`INSERT INTO session (id,project_id,slug,directory,title,version,time_created,time_updated,parent_id)
      VALUES ('ses_quota_child','quota-project','child','/quota','child','test',1,1,${input.sessionID})`)
          expect((yield* Effect.exit(quota.bind("ses_quota_child", 99)))._tag).toBe("Failure")
          yield* Effect.scoped(
            Effect.gen(function* () {
              const lease = (yield* quota.open({ ...input, sessionID: "ses_quota_child" }))!
              yield* lease.dispatch
              lease.observe(LLMEvent.finish({ reason: "stop", usage: new Usage({ totalTokens: 75 }) }))
            }),
          )
        }),
      )
      expect([...state.calls.values()][0]).toMatchObject({
        userId: 7,
        rootSessionId: input.sessionID,
        sessionId: "ses_quota_child",
      })
    }),
  15000,
)

test("metered native transport disables hidden retries", async () => {
  let attempts = 0
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      attempts++
      return Response.json({ error: { message: "test rate limit" } }, { status: 429 })
    },
  })
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const executor = yield* RequestExecutor.Service
        const result = yield* Effect.exit(executor.execute(HttpClientRequest.get(server.url.href)))
        expect(result._tag).toBe("Failure")
      }).pipe(
        Effect.provideService(RequestExecutor.RetryLimit, 0),
        Effect.provide(RequestExecutor.fetchLayer),
        Effect.scoped,
      ),
    )
    expect(attempts).toBe(1)
  } finally {
    server.stop(true)
  }
})

test("quota uses supplier totals and does not count reasoning twice", () => {
  expect(
    TokenQuota.normalizeUsage(
      new Usage({
        inputTokens: 100,
        outputTokens: 40,
        reasoningTokens: 10,
        cacheReadInputTokens: 20,
        totalTokens: 140,
      }),
    ),
  ).toMatchObject({ total: 140, output: 40, reasoning: 10 })
  expect(TokenQuota.normalizeUsage(undefined)).toBeUndefined()
  expect(TokenQuota.normalizeUsage(new Usage({}))).toBeUndefined()
})

test(
  "provider is not reached when quota denies admission",
  () =>
    fixture(async (state) => {
      state.mode.reject = true
      let invoked = 0
      await expect(
        state.run(
          Effect.gen(function* () {
            const quota = yield* TokenQuota.Service
            yield* quota.bind(input.sessionID, 7, true)
            yield* Effect.scoped(
              Effect.gen(function* () {
                yield* quota.open(input)
                invoked++
              }),
            )
          }),
        ),
      ).rejects.toThrow("额度不足")
      expect(invoked).toBe(0)
    }),
  15000,
)

test(
  "full output budget is reserved and supplier usage is delivered",
  () =>
    fixture(async (state) => {
      await state.run(
        Effect.gen(function* () {
          const quota = yield* TokenQuota.Service
          yield* quota.bind(input.sessionID, 7, true)
          yield* Effect.scoped(
            Effect.gen(function* () {
              const lease = (yield* quota.open(input))!
              expect(lease.maxOutputTokens).toBe(32000)
              yield* lease.dispatch
              lease.observe(
                LLMEvent.finish({
                  reason: "stop",
                  usage: new Usage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
                }),
              )
            }),
          )
        }),
      )
      expect(state.calls.size).toBe(1)
      expect([...state.calls.values()][0].maxOutputTokens).toBe(32000)
      expect([...state.results.values()][0]).toMatchObject({ outcome: "settled", usage: { total: 150 } })
    }),
  15000,
)

test(
  "settlement failure is persisted and replayed without another provider call",
  () =>
    fixture(async (state) => {
      state.mode.finishUnavailable = true
      let invoked = 0
      await state.run(
        Effect.gen(function* () {
          const quota = yield* TokenQuota.Service
          const db = (yield* Database.Service).db
          yield* quota.bind(input.sessionID, 7, true)
          yield* Effect.scoped(
            Effect.gen(function* () {
              const lease = (yield* quota.open(input))!
              yield* lease.dispatch
              invoked++
              lease.observe(LLMEvent.finish({ reason: "stop", usage: new Usage({ totalTokens: 175 }) }))
            }),
          )
          expect((yield* db.select().from(QuotaOutboxTable).all()).length).toBe(1)
          state.mode.finishUnavailable = false
          yield* db.update(QuotaOutboxTable).set({ time_updated: 0 }).run()
          yield* quota.replay
          expect((yield* db.select().from(QuotaOutboxTable).all()).length).toBe(0)
        }),
      )
      expect(invoked).toBe(1)
      expect(state.calls.size).toBe(1)
      expect([...state.results.values()][0]).toMatchObject({ outcome: "settled", usage: { total: 175 } })
    }),
  15000,
)

test(
  "interruption with no usage is unknown, while undispatched requests can be released",
  () =>
    fixture(async (state) => {
      await state.run(
        Effect.gen(function* () {
          const quota = yield* TokenQuota.Service
          yield* quota.bind(input.sessionID, 7, true)
          yield* Effect.scoped(
            Effect.gen(function* () {
              yield* quota.open(input)
            }),
          )
          yield* Effect.scoped(
            Effect.gen(function* () {
              const lease = (yield* quota.open(input))!
              yield* lease.dispatch
            }),
          )
        }),
      )
      expect([...state.results.values()].map((value) => value.outcome).sort()).toEqual(["not_sent", "unknown"])
    }),
  15000,
)

test(
  "crash recovery keeps ambiguous reservations and never invokes a model",
  () =>
    fixture(async (state) => {
      await state.run(
        Effect.gen(function* () {
          const quota = yield* TokenQuota.Service
          const db = (yield* Database.Service).db
          const call = {
            callId: "crashed-call",
            userId: 7,
            sessionId: input.sessionID,
            rootSessionId: input.sessionID,
            providerId: "test",
            modelId: "model",
            estimatedInputTokens: 100,
            maxOutputTokens: 32000,
          }
          yield* db
            .insert(QuotaOutboxTable)
            .values({ call_id: call.callId, request_json: JSON.stringify(call), dispatched: 1, time_updated: 0 })
            .run()
          yield* quota.replay
          expect(
            yield* db.select().from(QuotaOutboxTable).where(eq(QuotaOutboxTable.call_id, call.callId)).get(),
          ).toBeUndefined()
        }),
      )
      expect(state.results.get("crashed-call")).toEqual({ outcome: "unknown" })
    }),
  15000,
)

test(
  "browser identity headers cannot replace authenticated identity",
  () =>
    fixture(async (state) => {
      await state.run(
        Effect.gen(function* () {
          const quota = yield* TokenQuota.Service
          expect(
            yield* quota.identity({ "x-opencode-user-id": "99", "x-dockapi-authorization": "Bearer user-token" }),
          ).toBe(7)
          expect((yield* Effect.exit(quota.identity({ "x-opencode-user-id": "99" })))._tag).toBe("Failure")
          yield* quota.bind(input.sessionID, 7, true)
          expect((yield* Effect.exit(quota.bind(input.sessionID, 99, true)))._tag).toBe("Failure")
        }),
      )
    }),
  15000,
)
