import { expect, test } from "bun:test"
import { wrapMarkdownTables } from "./markdown-tables"

function parse(html: string) {
  const template = document.createElement("template")
  template.innerHTML = html
  return template.content
}

test("leaves non-table HTML and escaped code untouched", () => {
  for (const html of [
    "",
    "<h2>研究结论</h2><p>原始正文</p>",
    "<pre><code>&lt;table&gt;example&lt;/table&gt;</code></pre>",
  ])
    expect(wrapMarkdownTables(html)).toBe(html)
})

test("gives each table its own scroll container without wrapping nearby prose", () => {
  const content = parse(
    wrapMarkdownTables(
      "<h2>研究结论</h2><p>正文</p><table><tr><td>A</td></tr></table><p>后文</p><table><tr><td>B</td></tr></table>",
    ),
  )
  expect(content.querySelectorAll("[data-markdown-table]").length).toBe(2)
  expect(content.querySelectorAll("[data-markdown-table] table").length).toBe(2)
  expect(content.querySelectorAll("[data-markdown-table] :is(h2,p)").length).toBe(0)
  expect(content.textContent).toBe("研究结论正文A后文B")
})

test("preserves captions, merged cells, alignment, code and source links", () => {
  const content = parse(
    wrapMarkdownTables(
      '<TABLE><caption>数据</caption><thead><tr><th colspan="2">指标</th></tr></thead><tbody><tr><td align="right"><code>001</code></td><td><a href="https://example.com/source">来源</a></td></tr></tbody></TABLE>',
    ),
  )
  expect(content.querySelector("caption")?.textContent).toBe("数据")
  expect(content.querySelector("th")?.getAttribute("colspan")).toBe("2")
  expect(content.querySelector("td")?.getAttribute("align")).toBe("right")
  expect(content.querySelector("code")?.textContent).toBe("001")
  expect(content.querySelector("a")?.getAttribute("href")).toBe("https://example.com/source")
})

test("is idempotent and still handles nested tables independently", () => {
  const once = wrapMarkdownTables("<table><tr><td><table><tr><td>nested</td></tr></table></td></tr></table>")
  expect(wrapMarkdownTables(once)).toBe(once)
  expect(parse(once).querySelectorAll("[data-markdown-table]").length).toBe(2)
})
