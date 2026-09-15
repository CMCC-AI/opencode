import { describe, expect, test } from "bun:test"
import { isStockLabPath, resolveStockLabURL } from "./cmcc-stock-lab"

describe("AlphaLab route", () => {
  test("matches only the stock lab route", () => {
    expect(isStockLabPath("/stock-lab")).toBe(true)
    expect(isStockLabPath("/stock-lab/")).toBe(true)
    expect(isStockLabPath("/expert/stock-lab")).toBe(false)
  })

  test("forces embedded mode for configured and fallback URLs", () => {
    const location = { protocol: "https:", hostname: "cmcc.example.com", href: "https://cmcc.example.com/stock-lab" }

    expect(resolveStockLabURL("https://stock.example.com/lab?theme=dark", location, false)).toBe(
      "https://stock.example.com/lab?theme=dark&embed=1",
    )
    expect(resolveStockLabURL(undefined, location, true)).toBe("https://cmcc.example.com:3010/?embed=1")
    expect(resolveStockLabURL(undefined, location, false)).toBe("https://cmcc.example.com/stock-app/?embed=1")
  })
})
