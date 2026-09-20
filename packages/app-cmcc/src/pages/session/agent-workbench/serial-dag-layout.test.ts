import { expect, test } from "bun:test"
import { serialDagEdgePath, serialDagRows } from "./serial-dag-layout"

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
})

test("splits even and odd chains without changing the execution order", () => {
  const ten = Array.from({ length: 10 }, (_, index) => index + 1)
  expect(serialDagRows(ten)).toEqual([
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
  ])
  expect(serialDagRows([1, 2, 3, 4, 5])).toEqual([
    [1, 2, 3],
    [4, 5],
  ])
  expect(serialDagRows(ten).flat()).toEqual(ten)
  expect(serialDagRows([])).toEqual([])
  expect(serialDagRows([1])).toEqual([[1]])
})

test("connects horizontal nodes from the facing sides in both directions", () => {
  const bounds = rect(50, 30, 500, 300)
  const left = rect(70, 60, 80, 56)
  const right = rect(170, 60, 80, 56)
  expect(serialDagEdgePath(left, right, bounds)).toBe("M 101 58 H 115")
  expect(serialDagEdgePath(right, left, bounds)).toBe("M 119 58 H 105")
})

test("turns outside the rightmost nodes and enters the bottom row from the right", () => {
  const bounds = rect(50, 30, 500, 300)
  const top = rect(340, 60, 128, 56)
  const bottom = rect(340, 220, 128, 56)
  expect(serialDagEdgePath(top, bottom, bounds)).toBe("M 419 58 H 484 Q 494 58 494 68 V 208 Q 494 218 484 218 H 423")
})

test("vertical mode keeps one node per row in execution order", () => {
  expect(serialDagRows([1, 2, 3], "vertical")).toEqual([[1], [2], [3]])
  expect(serialDagRows([], "vertical")).toEqual([])
  expect(serialDagRows([1, 2, 3])).toEqual([[1, 2], [3]])
})

test("vertical edges connect the bottom and top centres without a side turn", () => {
  const bounds = rect(50, 30, 500, 340)
  expect(serialDagEdgePath(rect(210, 70, 180, 56), rect(210, 200, 180, 56), bounds, "vertical")).toBe("M 250 97 V 165")
})
