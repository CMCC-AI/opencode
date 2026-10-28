export * as TokenQuota from "./client"

import { timingSafeEqual } from "node:crypto"
import { LLMError, QuotaExceededReason, type LLMEvent, type Usage } from "@opencode-ai/llm"
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schedule, Schema, Scope } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { SessionTable } from "../session/sql"
import { SessionSchema } from "../session/schema"
import { Token } from "../util/token"
import { QuotaOutboxTable, QuotaSessionTable } from "./sql"

const NumberValue = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
const Request = Schema.Struct({
  callId: Schema.String,
  userId: NumberValue,
  sessionId: Schema.String,
  rootSessionId: Schema.String,
  providerId: Schema.String,
  modelId: Schema.String,
  estimatedInputTokens: NumberValue,
  maxOutputTokens: NumberValue,
})
const Result = Schema.Struct({
  callId: Schema.String,
  status: Schema.String,
  maxOutputTokens: NumberValue,
  reservedTokens: NumberValue,
  weekStart: NumberValue,
})
const UsageData = Schema.Struct({
  total: NumberValue,
  input: Schema.NullOr(NumberValue),
  output: Schema.NullOr(NumberValue),
  reasoning: Schema.NullOr(NumberValue),
  cacheRead: Schema.NullOr(NumberValue),
  cacheWrite: Schema.NullOr(NumberValue),
})
const Finish = Schema.Struct({
  outcome: Schema.Literals(["settled", "not_sent", "unknown"]),
  usage: Schema.optional(UsageData),
})
const Envelope = Schema.Struct({ code: Schema.Number, message: Schema.optional(Schema.String), data: Schema.Unknown })
const Profile = Schema.Struct({ user: Schema.Struct({ id: NumberValue }) })

export type Input = {
  sessionID: string
  providerID: string
  modelID: string
  input: unknown
  maxOutputTokens?: number
}
export type Lease = {
  maxOutputTokens: number
  dispatch: Effect.Effect<void, LLMError>
  observe: (event: LLMEvent) => void
}
export interface Interface {
  enabled: boolean
  identity: (headers: Record<string, string | undefined>) => Effect.Effect<number | undefined, LLMError>
  bind: (sessionID: string, userID: number, fresh?: boolean) => Effect.Effect<void, LLMError>
  open: (input: Input) => Effect.Effect<Lease | undefined, LLMError, Scope.Scope>
  replay: Effect.Effect<void>
}
export class Service extends Context.Service<Service, Interface>()("@opencode/DockAPIQuota") {}

export function failure(message: string, status?: number) {
  return new LLMError({
    module: "DockAPIQuota",
    method: "admit",
    reason: new QuotaExceededReason({
      message,
      ...(status === undefined ? {} : { providerMetadata: { dockapi: { status } } }),
    }),
  })
}

export function normalizeUsage(usage: Usage | undefined): typeof UsageData.Type | undefined {
  if (!usage) return
  const value = (n: number | undefined) => (n !== undefined && Number.isSafeInteger(n) && n >= 0 ? n : null)
  const input = value(usage.nonCachedInputTokens)
  const output = value(usage.outputTokens)
  const cacheRead = value(usage.cacheReadInputTokens)
  const cacheWrite = value(usage.cacheWriteInputTokens)
  const total =
    value(usage.totalTokens) ??
    (input !== null && output !== null ? input + output + (cacheRead ?? 0) + (cacheWrite ?? 0) : null)
  if (total === null || !Number.isSafeInteger(total)) return
  return { total, input, output, cacheRead, cacheWrite, reasoning: value(usage.reasoningTokens) }
}

export function settings() {
  const flag = process.env.OPENCODE_DOCKAPI_QUOTA_ENABLED
  if (flag !== undefined && flag !== "true" && flag !== "false")
    throw new Error("OPENCODE_DOCKAPI_QUOTA_ENABLED must be true or false")
  if (flag !== "true") return
  const base = process.env.OPENCODE_DOCKAPI_URL?.replace(/\/+$/, "")
  const token = process.env.DOCKAPI_QUOTA_SERVICE_TOKEN
  if (!base || !token || token.length < 32)
    throw new Error("DockAPI quota requires its URL and a service token of at least 32 characters")
  const url = new URL(base)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error("Invalid DockAPI quota URL")
  return { base, token }
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    const config = settings()
    const active = new Set<string>()

    const api = (path: string, body?: unknown, authorization?: string) =>
      Effect.tryPromise({
        try: async () => {
          if (!config) throw failure("额度服务未启用")
          const response = await fetch(config.base + path, {
            method: body === undefined ? "GET" : "POST",
            headers: {
              "Content-Type": "application/json",
              "X-DockAPI-Service-Token": config.token,
              ...(authorization ? { Authorization: authorization } : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(5_000),
          })
          const parsed = Schema.decodeUnknownOption(Envelope)(await response.json())
          if (!response.ok || Option.isNone(parsed) || parsed.value.code !== 200)
            throw failure(
              Option.isSome(parsed) ? (parsed.value.message ?? "额度请求失败") : "额度服务响应无效",
              response.status,
            )
          return parsed.value.data
        },
        catch: (error) => (error instanceof LLMError ? error : failure("额度服务暂时不可用，未发起新的模型调用")),
      })
    const decode =
      <A, I>(schema: Schema.Codec<A, I>) =>
      (value: unknown) =>
        Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(() => failure("额度服务响应格式不正确")))

    const identity: Interface["identity"] = (headers) =>
      Effect.gen(function* () {
        if (!config) return
        const supplied = headers["x-dockapi-service-token"]
        if (
          supplied &&
          Buffer.byteLength(supplied) === Buffer.byteLength(config.token) &&
          timingSafeEqual(Buffer.from(supplied), Buffer.from(config.token))
        ) {
          const id = Number(headers["x-opencode-user-id"])
          if (Number.isSafeInteger(id) && id > 0) return id
          return yield* failure("内部会话缺少有效用户身份")
        }
        const authorization = headers["x-dockapi-authorization"]
        if (!authorization?.startsWith("Bearer ")) return yield* failure("请登录后使用研究服务")
        const profile = yield* api("/api/user/profile", undefined, authorization).pipe(Effect.flatMap(decode(Profile)))
        return profile.user.id
      })

    const owner = Effect.fn("Quota.owner")(function* (sessionID: string) {
      const seen = new Set<string>()
      let id = sessionID
      while (!seen.has(id)) {
        seen.add(id)
        const binding = yield* db
          .select()
          .from(QuotaSessionTable)
          .where(eq(QuotaSessionTable.session_id, id))
          .get()
          .pipe(Effect.orDie)
        if (binding) return binding
        const session = yield* db
          .select({ parent: SessionTable.parent_id })
          .from(SessionTable)
          .where(eq(SessionTable.id, SessionSchema.ID.make(id)))
          .get()
          .pipe(Effect.orDie)
        if (!session?.parent) break
        id = session.parent
      }
      return undefined
    })
    const bind: Interface["bind"] = (sessionID, userID, fresh) =>
      Effect.gen(function* () {
        if (!config) return
        const binding = yield* owner(sessionID)
        if (binding && binding.user_id !== userID) return yield* failure("会话不属于当前登录用户")
        if (!binding && !fresh) {
          const stored = yield* api(`/api/internal/token-quota/session-owner/${encodeURIComponent(sessionID)}`).pipe(
            Effect.flatMap(decode(Schema.Struct({ userId: NumberValue }))),
          )
          if (stored.userId !== userID) return yield* failure("会话不属于当前登录用户")
        }
        yield* db
          .insert(QuotaSessionTable)
          .values({ session_id: sessionID, user_id: userID, root_session_id: binding?.root_session_id ?? sessionID })
          .onConflictDoNothing()
          .run()
          .pipe(Effect.orDie)
        const saved = yield* owner(sessionID)
        if (saved?.user_id !== userID) return yield* failure("会话用户绑定冲突")
      })

    const deliver = (row: typeof QuotaOutboxTable.$inferSelect) =>
      Effect.gen(function* () {
        const request = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Request)))(
          row.request_json,
        ).pipe(Effect.orDie)
        const finish = row.finish_json
          ? yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Finish)))(
              row.finish_json,
            ).pipe(Effect.orDie)
          : { outcome: "unknown" as const }
        const reservation = row.dispatched
          ? undefined
          : yield* api("/api/internal/token-quota/reserve", request).pipe(Effect.flatMap(decode(Result)))
        if (!reservation || !["settled", "released"].includes(reservation.status) || row.finish_json)
          yield* api(`/api/internal/token-quota/${encodeURIComponent(row.call_id)}/finish`, finish)
        yield* db
          .delete(QuotaOutboxTable)
          .where(
            and(
              eq(QuotaOutboxTable.call_id, row.call_id),
              eq(QuotaOutboxTable.time_updated, row.time_updated),
              row.finish_json === null
                ? isNull(QuotaOutboxTable.finish_json)
                : eq(QuotaOutboxTable.finish_json, row.finish_json),
            ),
          )
          .run()
          .pipe(Effect.orDie)
      })
    const replay = Effect.gen(function* () {
      if (!config) return
      const rows = yield* db
        .select()
        .from(QuotaOutboxTable)
        .where(or(isNotNull(QuotaOutboxTable.finish_json), lt(QuotaOutboxTable.time_updated, Date.now() - 300_000)))
        .orderBy(QuotaOutboxTable.time_updated)
        .limit(100)
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(
        rows.filter((row) => !active.has(row.call_id)),
        (row) =>
          deliver(row).pipe(
            Effect.catchCause(() =>
              Effect.gen(function* () {
                yield* db
                  .update(QuotaOutboxTable)
                  .set({ time_updated: Date.now() })
                  .where(
                    and(eq(QuotaOutboxTable.call_id, row.call_id), eq(QuotaOutboxTable.time_updated, row.time_updated)),
                  )
                  .run()
                  .pipe(Effect.orDie)
                yield* Effect.logWarning("Token quota settlement pending", { callID: row.call_id })
              }),
            ),
          ),
        { discard: true },
      )
    })

    const open: Interface["open"] = (input) =>
      Effect.gen(function* () {
        if (!config) return
        if (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens! <= 0)
          return yield* failure("当前模型缺少有效的最大输出 Token 配置")
        const binding = yield* owner(input.sessionID)
        if (!binding) return yield* failure("会话尚未绑定已认证的用户，请重新提交问题")
        const request: typeof Request.Type = {
          callId: crypto.randomUUID(),
          userId: binding.user_id,
          sessionId: input.sessionID,
          rootSessionId: binding.root_session_id,
          providerId: input.providerID,
          modelId: input.modelID,
          estimatedInputTokens: Token.estimate(JSON.stringify(input.input)),
          maxOutputTokens: input.maxOutputTokens!,
        }
        let usage: typeof UsageData.Type | undefined
        let dispatched = false
        let refused = false
        yield* Effect.acquireRelease(
          Effect.gen(function* () {
            yield* db
              .insert(QuotaOutboxTable)
              .values({ call_id: request.callId, request_json: JSON.stringify(request), time_updated: Date.now() })
              .run()
              .pipe(Effect.orDie)
            active.add(request.callId)
          }),
          () =>
            Effect.gen(function* () {
              if (refused) {
                yield* db
                  .delete(QuotaOutboxTable)
                  .where(eq(QuotaOutboxTable.call_id, request.callId))
                  .run()
                  .pipe(Effect.orDie)
                return
              }
              const finish: typeof Finish.Type = usage
                ? { outcome: "settled", usage }
                : { outcome: dispatched ? "unknown" : "not_sent" }
              yield* db
                .insert(QuotaOutboxTable)
                .values({
                  call_id: request.callId,
                  request_json: JSON.stringify(request),
                  dispatched: Number(dispatched),
                  finish_json: JSON.stringify(finish),
                  time_updated: Date.now(),
                })
                .onConflictDoUpdate({
                  target: QuotaOutboxTable.call_id,
                  set: {
                    finish_json: JSON.stringify(finish),
                    dispatched: Number(dispatched),
                    time_updated: Date.now(),
                  },
                })
                .run()
                .pipe(Effect.orDie)
              const row = yield* db
                .select()
                .from(QuotaOutboxTable)
                .where(eq(QuotaOutboxTable.call_id, request.callId))
                .get()
                .pipe(Effect.orDie)
              if (row)
                yield* deliver(row).pipe(
                  Effect.catch(() => Effect.logWarning("Token quota settlement queued", { callID: request.callId })),
                )
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  active.delete(request.callId)
                }),
              ),
            ),
        )
        const reservation = yield* api("/api/internal/token-quota/reserve", request).pipe(
          Effect.flatMap(decode(Result)),
          Effect.tapError((error) =>
            Effect.sync(() => {
              const status =
                error.reason instanceof QuotaExceededReason ? error.reason.providerMetadata?.dockapi?.status : undefined
              refused = typeof status === "number" && status >= 400 && status < 500
            }),
          ),
        )
        if (
          reservation.status !== "reserved" ||
          reservation.callId !== request.callId ||
          reservation.maxOutputTokens < 1 ||
          reservation.maxOutputTokens > request.maxOutputTokens
        )
          return yield* failure("模型调用额度状态无效")
        const heartbeat = Effect.gen(function* () {
          yield* db
            .update(QuotaOutboxTable)
            .set({ time_updated: Date.now() })
            .where(eq(QuotaOutboxTable.call_id, request.callId))
            .run()
            .pipe(Effect.orDie)
          yield* api(`/api/internal/token-quota/${request.callId}/heartbeat`, {})
        })
        yield* Effect.suspend(() => (dispatched ? heartbeat : Effect.void)).pipe(
          Effect.catch(() => Effect.void),
          Effect.repeat(Schedule.spaced("30 seconds")),
          Effect.forkScoped,
        )
        return {
          maxOutputTokens: reservation.maxOutputTokens,
          dispatch: Effect.gen(function* () {
            // Persist before contacting the provider; ambiguous interruptions remain held for reconciliation.
            dispatched = true
            yield* db
              .update(QuotaOutboxTable)
              .set({ dispatched: 1, time_updated: Date.now() })
              .where(eq(QuotaOutboxTable.call_id, request.callId))
              .run()
              .pipe(Effect.orDie)
            yield* heartbeat
          }),
          observe: (event) => {
            if ("usage" in event) usage = normalizeUsage(event.usage) ?? usage
          },
        }
      })
    if (config) yield* replay.pipe(Effect.repeat(Schedule.spaced("30 seconds")), Effect.forkScoped)
    return Service.of({ enabled: !!config, identity, bind, open, replay })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
