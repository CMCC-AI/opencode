import { Schema } from "effect"

const Count = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
export const TokenQuotaSnapshot = Schema.Struct({
  enabled: Schema.Boolean,
  vip: Schema.Boolean,
  weeklyLimit: Schema.NullOr(Count),
  used: Count,
  reserved: Count,
  remaining: Schema.NullOr(Count),
  weekStart: Schema.Number,
  resetAt: Schema.Number,
  hasUnknownUsage: Schema.Boolean,
})
export type TokenQuotaSnapshot = typeof TokenQuotaSnapshot.Type

export function parseQuotaSnapshot(value: unknown): TokenQuotaSnapshot {
  if (!Schema.is(TokenQuotaSnapshot)(value)) throw new Error("额度服务返回的数据不完整，请稍后重试")
  if (value.enabled && !value.vip && (value.weeklyLimit === null || value.remaining === null))
    throw new Error("普通用户周 Token 额度尚未正确配置")
  return value
}

export function requireResearchQuota(value: TokenQuotaSnapshot) {
  if (!value.enabled || value.vip) return
  if (value.weeklyLimit === null || value.remaining === null) throw new Error("普通用户周 Token 额度尚未正确配置")
  if (value.remaining <= 0) throw new Error("本周 Token 额度不足，请联系管理员或等待下周一重置")
}
