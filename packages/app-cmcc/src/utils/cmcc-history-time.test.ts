import { describe, expect, test } from "bun:test"
import { cmccHistoryTime } from "./cmcc-history-time"

describe("CMCC history relative time", () => {
  const now = Date.parse("2026-10-30T12:00:00+08:00")

  test.each([
    [0, "1 分"],
    [59_000, "1 分"],
    [2 * 60_000, "2 分"],
    [59 * 60_000, "59 分"],
    [60 * 60_000, "1 时"],
    [23 * 60 * 60_000, "23 时"],
    [24 * 60 * 60_000, "1 天"],
    [3 * 24 * 60 * 60_000, "3 天"],
  ])("formats an age of %d milliseconds as %s", (age, label) => {
    expect(cmccHistoryTime(now - age, now)).toBe(label)
  })

  test("uses the same format for ISO research dates and OpenCode timestamps", () => {
    const at = now - 120_000
    expect(cmccHistoryTime(Date.parse(new Date(at).toISOString()), now)).toBe(cmccHistoryTime(at, now))
  })

  test("does not invent a date when the timestamp is invalid", () => {
    expect(cmccHistoryTime(Date.parse("invalid"), now)).toBe("--")
    expect(cmccHistoryTime(Infinity, now)).toBe("--")
    expect(cmccHistoryTime(now + 60_000, now)).toBe("1 分")
  })
})
