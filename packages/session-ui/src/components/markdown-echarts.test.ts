import { describe, expect, test } from "bun:test"
import { parseEchartsOption } from "./markdown-echarts"

const valid = JSON.stringify({
  title: { text: "近 3 月收盘价（元）" },
  tooltip: { trigger: "axis" },
  grid: { containLabel: true },
  xAxis: { type: "category", data: ["26-09", "26-10", "26-11"] },
  yAxis: [{ type: "value", scale: true }],
  series: [{ name: "收盘价", type: "line", data: [30.1, 31.2, 30.8], color: "#b3352c" }],
})

describe("parseEchartsOption", () => {
  test("accepts valid option JSON with line/bar/pie series", () => {
    expect(parseEchartsOption(valid)?.series).toBeDefined()
    expect(parseEchartsOption('{"series":[{"type":"pie","data":[1]}]}')).toBeDefined()
  })

  test("accepts option without series", () => {
    expect(parseEchartsOption('{"title":{"text":"x"}}')).toBeDefined()
  })

  test("rejects invalid JSON and non-object values", () => {
    expect(parseEchartsOption("{ not json")).toBeUndefined()
    expect(parseEchartsOption("[]")).toBeUndefined()
    expect(parseEchartsOption('"text"')).toBeUndefined()
  })

  test("rejects series types outside the chart contract", () => {
    expect(parseEchartsOption('{"series":[{"type":"graph","data":[]}]}')).toBeUndefined()
    expect(parseEchartsOption('{"series":{"type":"line","data":[1]}}')).toBeDefined()
    expect(parseEchartsOption('{"series":[{"type":"line","data":[1]},{"type":"heatmap","data":[]}]}')).toBeUndefined()
  })

  test("accepts candlestick and scatter series from the v1.3.0 contract", () => {
    expect(parseEchartsOption('{"series":[{"type":"candlestick","data":[[10,20,5,25]]}]}')).toBeDefined()
    expect(parseEchartsOption('{"series":[{"type":"scatter","data":[[1,2]]}]}')).toBeDefined()
  })
})
