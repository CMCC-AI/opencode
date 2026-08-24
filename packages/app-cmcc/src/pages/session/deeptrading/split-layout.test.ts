import { describe, expect, test } from "bun:test"
import {
  DEEPTRADING_RIGHT_DEFAULT_PERCENT,
  DEEPTRADING_RIGHT_MAX_PERCENT,
  DEEPTRADING_RIGHT_MIN_PERCENT,
  clampDeepTradingRightPercent,
  deepTradingRightPercentAfterDrag,
} from "./split-layout"

describe("DeepTrading split layout", () => {
  test("clamps persisted panel widths to the supported range", () => {
    expect(clampDeepTradingRightPercent(Number.NaN)).toBe(DEEPTRADING_RIGHT_DEFAULT_PERCENT)
    expect(clampDeepTradingRightPercent(20)).toBe(DEEPTRADING_RIGHT_MIN_PERCENT)
    expect(clampDeepTradingRightPercent(80)).toBe(DEEPTRADING_RIGHT_MAX_PERCENT)
  })

  test("shrinks the right panel when the separator moves right", () => {
    expect(
      deepTradingRightPercentAfterDrag({
        startPercent: 45,
        startX: 500,
        currentX: 600,
        containerWidth: 1_000,
      }),
    ).toBe(35)
  })

  test("expands the right panel when the separator moves left", () => {
    expect(
      deepTradingRightPercentAfterDrag({
        startPercent: 45,
        startX: 500,
        currentX: 400,
        containerWidth: 1_000,
      }),
    ).toBe(55)
  })
})
