import { expect, test } from "bun:test"
import { createCaseHandoff } from "./case-handoff"

test("a navigation consumes the same object exactly once without persistent caching", () => {
  const handoff = createCaseHandoff<{ snapshot: string }>()
  try {
    const value = { snapshot: "large payload" }
    const token = handoff.stage("case-a", 1, value)
    expect(handoff.take("case-a", 1, undefined)).toBeUndefined()
    expect(handoff.take("case-a", 1, token)).toBe(value)
    expect(handoff.take("case-a", 1, token)).toBeUndefined()
  } finally {
    handoff.clear()
  }
})

test("a different case or authorization scope cannot consume an old result", () => {
  const handoff = createCaseHandoff<string>()
  try {
    const first = handoff.stage("case-a", 1, "old user")
    expect(handoff.take("case-a", 2, first)).toBeUndefined()
    const second = handoff.stage("case-a", 2, "current user")
    expect(handoff.take("case-b", 2, second)).toBeUndefined()
    expect(handoff.take("case-a", 2, second)).toBeUndefined()
  } finally {
    handoff.clear()
  }
})

test("replacement and cancellation retain at most one pending result", () => {
  const handoff = createCaseHandoff<string>()
  try {
    const first = handoff.stage("case-a", 1, "first")
    const second = handoff.stage("case-b", 1, "second")
    handoff.clear(first)
    expect(handoff.take("case-a", 1, first)).toBeUndefined()
    expect(handoff.take("case-b", 1, second)).toBe("second")
    const third = handoff.stage("case-c", 1, "third")
    handoff.clear()
    expect(handoff.take("case-c", 1, third)).toBeUndefined()
  } finally {
    handoff.clear()
  }
})

test("an abandoned navigation expires rather than serving a stale snapshot later", () => {
  let now = 1_000
  const handoff = createCaseHandoff<string>(() => now)
  try {
    const token = handoff.stage("case-a", 1, "snapshot")
    now += 30_001
    expect(handoff.take("case-a", 1, token)).toBeUndefined()
  } finally {
    handoff.clear()
  }
})
