import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { TokenQuotaPolicyTable, TokenQuotaSessionTable, TokenQuotaUsageTable } from "@opencode-ai/core/token-quota/sql"
import type { Usage } from "@opencode-ai/llm"
import { and, eq, gte } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect"
import { NonNegativeInt, PositiveInt } from "@opencode-ai/core/schema"

const Config = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  identityHeader: Schema.optional(Schema.String),
  dailyTokens: Schema.optional(NonNegativeInt),
  monthlyTokens: Schema.optional(NonNegativeInt),
  requestTokens: Schema.optional(NonNegativeInt),
  reservationTokens: Schema.optional(PositiveInt),
  overage: Schema.optional(Schema.Literals(["reject", "allow_and_audit"])),
})
type Config = typeof Config.Type

type Policy = {
  dailyLimit?: number
  monthlyLimit?: number
  requestLimit?: number
  overage: "reject" | "allow_and_audit"
}

export type Reservation = {
  id: string
  maxOutputTokens?: number
}

export type TokenUsage = {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export class IdentityMissing extends Schema.TaggedErrorClass<IdentityMissing>()("TokenQuota.IdentityMissing", {
  message: Schema.String,
}) {}

export class SessionOwnerConflict extends Schema.TaggedErrorClass<SessionOwnerConflict>()(
  "TokenQuota.SessionOwnerConflict",
  { message: Schema.String },
) {}

export class Exceeded extends Schema.TaggedErrorClass<Exceeded>()("TokenQuota.Exceeded", {
  message: Schema.String,
  period: Schema.Literals(["request", "day", "month"]),
  limit: Schema.Number,
  used: Schema.Number,
  resetAt: Schema.optional(Schema.Number),
}) {}

export interface Interface {
  readonly enabled: boolean
  readonly identity: (headers: Record<string, string | undefined>) => Effect.Effect<string | undefined, IdentityMissing>
  readonly bindSession: (input: { sessionID: string; userID: string }) => Effect.Effect<void, SessionOwnerConflict>
  readonly reserve: (input: {
    sessionID: string
    parentSessionID?: string
    requestID: string
    providerID: string
    modelID: string
    credential?: string
    estimatedInputTokens: number
    maxOutputTokens?: number
  }) => Effect.Effect<Reservation | undefined, IdentityMissing | Exceeded | SessionOwnerConflict>
  readonly settle: (reservation: Reservation, usage: TokenUsage) => Effect.Effect<void>
  readonly release: (reservation: Reservation) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/TokenQuota") {}

const safe = (value: number | undefined) => Math.max(0, Number.isFinite(value) ? Math.floor(value ?? 0) : 0)

export function normalizeUsage(usage: Usage | undefined): TokenUsage {
  const input = safe(usage?.nonCachedInputTokens)
  const output = safe(usage?.outputTokens)
  const reasoning = safe(usage?.reasoningTokens)
  const cacheRead = safe(usage?.cacheReadInputTokens)
  const cacheWrite = safe(usage?.cacheWriteInputTokens)
  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total: safe(usage?.totalTokens) || input + output + cacheRead + cacheWrite,
  }
}

function utcStart(now: number, month: boolean) {
  const date = new Date(now)
  return month
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
    : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function utcReset(now: number, month: boolean) {
  const date = new Date(now)
  return month
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
    : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
}

async function fingerprint(value: string | undefined) {
  if (!value) return undefined
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24)
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const json = process.env.OPENCODE_TOKEN_QUOTA
      ? Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(process.env.OPENCODE_TOKEN_QUOTA)
      : Option.none()
    const decoded = Option.flatMap(json, Schema.decodeUnknownOption(Config))
    const config: Config = Option.getOrElse(decoded, () => ({}))
    const enabled = config.enabled === true
    const identityHeader = (config.identityHeader ?? "x-opencode-user-id").toLowerCase()
    const reservationTokens = config.reservationTokens ?? 8192
    const locks = new Map<string, Semaphore.Semaphore>()
    const lock = (userID: string) => {
      const current = locks.get(userID)
      if (current) return current
      const created = Semaphore.makeUnsafe(1)
      locks.set(userID, created)
      return created
    }

    const identity: Interface["identity"] = (headers) => {
      if (!enabled) return Effect.succeed(undefined)
      const userID = headers[identityHeader]?.trim()
      if (userID && userID.length <= 255) return Effect.succeed(userID)
      return Effect.fail(new IdentityMissing({ message: `Token quota requires trusted header ${identityHeader}` }))
    }

    const bindSession: Interface["bindSession"] = Effect.fn("TokenQuota.bindSession")(function* (input) {
      yield* db
        .insert(TokenQuotaSessionTable)
        .values({ session_id: input.sessionID, user_id: input.userID })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
      const owner = yield* db
        .select({ userID: TokenQuotaSessionTable.user_id })
        .from(TokenQuotaSessionTable)
        .where(eq(TokenQuotaSessionTable.session_id, input.sessionID))
        .get()
        .pipe(Effect.orDie)
      if (owner?.userID === input.userID) return
      return yield* new SessionOwnerConflict({ message: "Session is already bound to another user" })
    })

    const owner = Effect.fn("TokenQuota.owner")(function* (sessionID: string, parentSessionID?: string) {
      const current = yield* db
        .select({ userID: TokenQuotaSessionTable.user_id })
        .from(TokenQuotaSessionTable)
        .where(eq(TokenQuotaSessionTable.session_id, sessionID))
        .get()
        .pipe(Effect.orDie)
      if (current) return current.userID
      if (!parentSessionID) return yield* new IdentityMissing({ message: "Session has no authenticated user binding" })
      const parent = yield* db
        .select({ userID: TokenQuotaSessionTable.user_id })
        .from(TokenQuotaSessionTable)
        .where(eq(TokenQuotaSessionTable.session_id, parentSessionID))
        .get()
        .pipe(Effect.orDie)
      if (!parent) return yield* new IdentityMissing({ message: "Parent session has no authenticated user binding" })
      yield* bindSession({ sessionID, userID: parent.userID })
      return parent.userID
    })

    const policy = Effect.fn("TokenQuota.policy")(function* (userID: string) {
      const row = yield* db
        .select()
        .from(TokenQuotaPolicyTable)
        .where(eq(TokenQuotaPolicyTable.user_id, userID))
        .get()
        .pipe(Effect.orDie)
      return {
        dailyLimit: row?.daily_limit ?? config.dailyTokens,
        monthlyLimit: row?.monthly_limit ?? config.monthlyTokens,
        requestLimit: row?.request_limit ?? config.requestTokens,
        overage: row?.overage ?? config.overage ?? "reject",
      } satisfies Policy
    })

    const reserve: Interface["reserve"] = Effect.fn("TokenQuota.reserve")(function* (input) {
      if (!enabled) return undefined
      const userID = yield* owner(input.sessionID, input.parentSessionID)
      return yield* lock(userID).withPermit(
        Effect.gen(function* () {
          const limits = yield* policy(userID)
          const estimatedInput = safe(input.estimatedInputTokens)
          if (limits.requestLimit !== undefined && estimatedInput >= limits.requestLimit)
            return yield* new Exceeded({
              message: "Estimated input exceeds the per-request token limit",
              period: "request",
              limit: limits.requestLimit,
              used: estimatedInput,
            })

          const now = Date.now()
          const rows = yield* db
            .select({
              status: TokenQuotaUsageTable.status,
              reserved: TokenQuotaUsageTable.reserved_tokens,
              total: TokenQuotaUsageTable.total_tokens,
              created: TokenQuotaUsageTable.time_created,
            })
            .from(TokenQuotaUsageTable)
            .where(
              and(
                eq(TokenQuotaUsageTable.user_id, userID),
                gte(TokenQuotaUsageTable.time_created, utcStart(now, true)),
              ),
            )
            .all()
            .pipe(Effect.orDie)
          const consumed = (start: number) =>
            rows
              .filter((row) => row.created >= start && row.status !== "released")
              .reduce((sum, row) => sum + (row.status === "reserved" ? row.reserved : row.total), 0)
          const dailyUsed = consumed(utcStart(now, false))
          const monthlyUsed = consumed(utcStart(now, true))
          const dailyRemaining = limits.dailyLimit === undefined ? Infinity : limits.dailyLimit - dailyUsed
          const monthlyRemaining = limits.monthlyLimit === undefined ? Infinity : limits.monthlyLimit - monthlyUsed
          const remaining = Math.min(dailyRemaining, monthlyRemaining)
          if (limits.overage === "reject" && remaining <= estimatedInput) {
            const daily = dailyRemaining <= monthlyRemaining
            const limit = daily ? limits.dailyLimit : limits.monthlyLimit
            return yield* new Exceeded({
              message: `${daily ? "Daily" : "Monthly"} token quota exceeded`,
              period: daily ? "day" : "month",
              limit: limit ?? 0,
              used: daily ? dailyUsed : monthlyUsed,
              resetAt: utcReset(now, !daily),
            })
          }

          const requestOutput =
            limits.requestLimit === undefined ? Infinity : Math.max(0, limits.requestLimit - estimatedInput)
          const quotaOutput = limits.overage === "reject" ? Math.max(0, remaining - estimatedInput) : Infinity
          const maxOutputTokens = Math.min(input.maxOutputTokens ?? Infinity, requestOutput, quotaOutput)
          const normalizedMax = Number.isFinite(maxOutputTokens) ? Math.floor(maxOutputTokens) : input.maxOutputTokens
          const outputReservation = Math.min(reservationTokens, normalizedMax ?? reservationTokens)
          const reserved = Math.min(
            estimatedInput + outputReservation,
            limits.overage === "reject" ? remaining : Infinity,
          )
          const id = crypto.randomUUID()
          yield* db
            .insert(TokenQuotaUsageTable)
            .values({
              id,
              user_id: userID,
              session_id: input.sessionID,
              request_id: input.requestID,
              provider_id: input.providerID,
              model_id: input.modelID,
              api_key_hash: yield* Effect.promise(() => fingerprint(input.credential)),
              status: "reserved",
              reserved_tokens: Math.max(1, Math.floor(reserved)),
            })
            .run()
            .pipe(Effect.orDie)
          return { id, maxOutputTokens: normalizedMax }
        }),
      )
    })

    const settle: Interface["settle"] = Effect.fn("TokenQuota.settle")(function* (reservation, usage) {
      yield* db
        .update(TokenQuotaUsageTable)
        .set({
          status: "settled",
          input_tokens: usage.input,
          output_tokens: usage.output,
          reasoning_tokens: usage.reasoning,
          cache_read_tokens: usage.cacheRead,
          cache_write_tokens: usage.cacheWrite,
          total_tokens: usage.total,
          time_settled: Date.now(),
        })
        .where(and(eq(TokenQuotaUsageTable.id, reservation.id), eq(TokenQuotaUsageTable.status, "reserved")))
        .run()
        .pipe(Effect.orDie)
    })

    const release: Interface["release"] = Effect.fn("TokenQuota.release")(function* (reservation) {
      yield* db
        .update(TokenQuotaUsageTable)
        .set({ status: "released", reserved_tokens: 0, time_settled: Date.now() })
        .where(and(eq(TokenQuotaUsageTable.id, reservation.id), eq(TokenQuotaUsageTable.status, "reserved")))
        .run()
        .pipe(Effect.orDie)
    })

    return Service.of({ enabled, identity, bindSession, reserve, settle, release })
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [Database.node] })

export * as TokenQuota from "./token-quota"
