import { describe, expect, test } from "bun:test"
import { marked } from "marked"
import { citationNumbers, renderCitations } from "./report-citations"

describe("report citation presentation", () => {
  test("keeps numbering independent of the shared async Markdown configuration", () => {
    const previous = marked.defaults.async
    marked.setOptions({ async: true })
    try {
      expect(Array.from(citationNumbers("<cite>https://example.org/source</cite>").entries())).toEqual([
        ["https://example.org/source", 1],
      ])
    } finally {
      marked.setOptions({ async: previous })
    }
  })
  test("indexes only real citations and reuses whole-report numbers", () => {
    const content =
      "# 报告\n\n第一章<cite>https://example.org/a</cite>。\n\n{{chart:1}}\n\n第二章<cite>https://example.org/b</cite>及重复<cite>https://example.org/a</cite>。普通链接 https://example.org/plain。"
    const numbers = citationNumbers(content)
    expect(Array.from(numbers.entries())).toEqual([
      ["https://example.org/a", 1],
      ["https://example.org/b", 2],
    ])
    const root = document.createElement("div")
    root.innerHTML = marked.parse(
      "第二章<cite>https://example.org/b</cite>及重复<cite>https://example.org/a</cite>。",
      { async: false },
    )
    renderCitations(root, numbers)
    expect(Array.from(root.querySelectorAll("sup a"), (link) => link.textContent)).toEqual(["2", "1"])
    expect(root.querySelector("cite")).toBeNull()
    expect(root.querySelector("a")!.getAttribute("href")).toBe("https://example.org/b")
    expect(root.querySelector("a")!.getAttribute("target")).toBe("_blank")
    expect(root.querySelector("a")!.getAttribute("rel")).toBe("noopener noreferrer")
    const result = root.innerHTML
    renderCitations(root, numbers)
    expect(root.innerHTML).toBe(result)
    expect(content).toContain("<cite>https://example.org/a</cite>")
  })
  test("leaves ordinary links, code examples, invalid references and hidden content alone", () => {
    const content =
      "普通 [链接](https://example.org/plain)\n\n`<cite>https://example.org/code</cite>`\n\n```html\n<cite>https://example.org/fence</cite>\n```\n\n<code><cite>https://example.org/raw-code</cite></code>\n\n<cite>javascript:alert(1)</cite>\n\n<cite>https://user:password@example.org/private</cite>\n\n<cite>不是网址</cite>\n\n<cite hidden>https://example.org/hidden</cite>\n\n<cite>https://example.org/valid</cite>"
    const numbers = citationNumbers(content)
    expect(Array.from(numbers.entries())).toEqual([["https://example.org/valid", 1]])
    const root = document.createElement("div")
    root.innerHTML = marked.parse(content, { async: false })
    renderCitations(root, numbers)
    expect(root.querySelectorAll("sup")).toHaveLength(1)
    expect(root.querySelector('a[href="https://example.org/plain"]')!.textContent).toBe("链接")
    expect(root.querySelector("pre")!.textContent).toContain("<cite>https://example.org/fence</cite>")
    expect(root.querySelector("cite")!.textContent).toBe("https://example.org/raw-code")
  })
  test("normalizes equivalent URLs and decodes escaped query parameters safely", () => {
    const numbers = citationNumbers(
      "<cite>https://EXAMPLE.org</cite><cite>https://example.org/</cite><cite>https://example.org/a?x=1&amp;y=2</cite>",
    )
    expect(Array.from(numbers.entries())).toEqual([
      ["https://example.org/", 1],
      ["https://example.org/a?x=1&y=2", 2],
    ])
  })
  test("refreshes existing labels without generating nested superscripts", () => {
    const root = document.createElement("div")
    root.innerHTML = marked.parse("<cite>https://example.org/b</cite>", { async: false })
    renderCitations(root, citationNumbers("<cite>https://example.org/b</cite>"))
    renderCitations(root, citationNumbers("<cite>https://example.org/a</cite><cite>https://example.org/b</cite>"))
    expect(root.querySelector("sup a")!.textContent).toBe("2")
    expect(root.querySelectorAll("sup")).toHaveLength(1)
  })
})
