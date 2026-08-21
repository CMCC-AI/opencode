import { describe, expect, test } from "bun:test"
import { isDagEdgeActive } from "./dag-layout"

describe("DeepTrading DAG layout", () => {
  test("keeps waiting paths gray and highlights paths once the target agent is reached", () => {
    expect(isDagEdgeActive(undefined)).toBe(false)
    expect(isDagEdgeActive("waiting")).toBe(false)
    expect(isDagEdgeActive("running")).toBe(true)
    expect(isDagEdgeActive("completed")).toBe(true)
    expect(isDagEdgeActive("failed")).toBe(true)
  })
})
