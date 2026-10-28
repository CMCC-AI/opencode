import { describe, expect, test } from "bun:test"
import { parseQuotaSnapshot, requireResearchQuota } from "./token-quota"

const snapshot = {
  enabled: true,
  vip: false,
  weeklyLimit: 100000,
  used: 90000,
  reserved: 10000,
  remaining: 0,
  weekStart: 1,
  resetAt: 2,
  hasUnknownUsage: false,
}

describe("weekly token quota", () => {
  test("zero available balance blocks research even with unspent reservations", () => {
    expect(() => requireResearchQuota(parseQuotaSnapshot(snapshot))).toThrow("额度不足")
  })
  test("VIP and explicitly disabled quota do not block research", () => {
    expect(() =>
      requireResearchQuota(parseQuotaSnapshot({ ...snapshot, vip: true, weeklyLimit: null, remaining: null })),
    ).not.toThrow()
    expect(() => requireResearchQuota(parseQuotaSnapshot({ ...snapshot, enabled: false }))).not.toThrow()
  })
  test("invalid or missing fields never silently grant unlimited quota", () => {
    expect(() => parseQuotaSnapshot({ enabled: true })).toThrow()
    expect(() => parseQuotaSnapshot({ ...snapshot, weeklyLimit: null })).toThrow()
    expect(() => parseQuotaSnapshot({ ...snapshot, remaining: -1 })).toThrow()
  })
})
