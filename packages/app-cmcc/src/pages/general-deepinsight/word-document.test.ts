import { describe, expect, test } from "bun:test"
import JSZip from "jszip"
import { createResearchWord } from "./word-document"

const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

async function report(html: string) {
  const element = document.createElement("div")
  element.innerHTML = html
  const blob = await createResearchWord(element)
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const parse = async (path: string) =>
    new DOMParser().parseFromString(await zip.file(path)!.async("string"), "application/xml")
  return {
    blob,
    zip,
    styles: await parse("word/styles.xml"),
    content: await parse("word/document.xml"),
    numbering: await parse("word/numbering.xml"),
  }
}

function descendants(element: Element | XMLDocument, tag: string) {
  return Array.from(element.getElementsByTagName("*")).filter(
    (node) => node.namespaceURI === namespace && node.localName === tag,
  )
}
function attr(element: Element | undefined, name: string) {
  return element?.getAttribute(`w:${name}`)
}

describe("fixed Word report template", () => {
  test("creates native DOCX with real title and paragraph styles without font embedding", async () => {
    const data = await report(
      "<h1>研究报告</h1><p>这是中文正文。</p><h2>一级章节</h2><p>正文</p><h3>二级章节</h3><p>正文</p><h4>三级章节</h4><p>正文</p>",
    )
    expect(data.blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(data.zip.file("[Content_Types].xml")).not.toBeNull()
    const find = (id: string) => descendants(data.styles, "style").find((style) => attr(style, "styleId") === id)!
    for (const [id, font, size] of [
      ["Title", "小标宋简体", "44"],
      ["Heading1", "黑体", "32"],
      ["Heading2", "楷体_GB2312", "32"],
      ["Heading3", "仿宋", "32"],
    ]) {
      const style = find(id!)
      expect(attr(descendants(style, "rFonts")[0], "eastAsia")).toBe(font)
      expect(attr(descendants(style, "sz")[0], "val")).toBe(size)
      expect(attr(descendants(style, "color")[0], "val")).toBe("000000")
    }
    expect(attr(descendants(find("Heading3"), "b")[0], "val")).not.toBe("false")
    expect(descendants(find("Heading3"), "b")).toHaveLength(1)
    const defaults = descendants(data.styles, "docDefaults")[0]!
    expect(attr(descendants(defaults, "rFonts")[0], "eastAsia")).toBe("仿宋_GB2312")
    expect(attr(descendants(defaults, "sz")[0], "val")).toBe("32")
    expect(attr(descendants(defaults, "spacing")[0], "line")).toBe("560")
    expect(attr(descendants(defaults, "spacing")[0], "lineRule")).toBe("exact")
    const body = find("ResearchBody")
    expect(body.parentElement).toBe(data.styles.documentElement)
    expect(attr(descendants(body, "ind")[0], "firstLineChars")).toBe("200")
    expect(descendants(data.content, "pStyle").map((style) => attr(style, "val"))).toEqual([
      "Title",
      "ResearchBody",
      "Heading1",
      "ResearchBody",
      "Heading2",
      "ResearchBody",
      "Heading3",
      "ResearchBody",
    ])
    expect(Object.keys(data.zip.files).some((name) => /\.odttf$|word\/fonts\//i.test(name))).toBe(false)
  })
  test("titles are not manufactured and later level-one headings remain sections", async () => {
    const data = await report("<h1>总标题</h1><h1>第二章</h1><h2>第三章</h2>")
    expect(descendants(data.content, "pStyle").map((style) => attr(style, "val"))).toEqual([
      "Title",
      "Heading1",
      "Heading1",
    ])
    const plain = await report("<p>没有标题的实际报告</p>")
    expect(descendants(plain.content, "pStyle").map((style) => attr(style, "val"))).toEqual(["ResearchBody"])
    const sections = await report("<h2>第一章</h2><h3>子章节</h3>")
    expect(descendants(sections.content, "pStyle").map((style) => attr(style, "val"))).toEqual(["Heading1", "Heading2"])
  })
  test("native lists preserve starts, nesting, checkboxes and do not inherit body indents", async () => {
    const data = await report(
      '<ol start="3"><li>序号三<ul><li>嵌套条目</li></ul></li><li><p>序号四</p><p>补充段落</p></li></ol><ul><li><input type="checkbox" checked />完成条目</li></ul>',
    )
    const text = descendants(data.content, "t")
      .map((node) => node.textContent)
      .join("")
    expect(text).toContain("☑ 完成条目")
    expect(descendants(data.content, "numPr")).toHaveLength(4)
    expect(descendants(data.numbering, "start").some((node) => attr(node, "val") === "3")).toBe(true)
    expect(descendants(data.numbering, "numFmt").some((node) => attr(node, "val") === "bullet")).toBe(true)
    expect(descendants(data.content, "pStyle").every((style) => attr(style, "val") === "ResearchList")).toBe(true)
    expect(descendants(data.content, "ind").every((node) => !attr(node, "firstLineChars"))).toBe(true)
  })
  test("tables remain real tables with headers, borders and merged cells", async () => {
    const data = await report(
      '<table><thead><tr><th colspan="2">表头</th></tr></thead><tbody><tr><td>中文</td><td>数据</td></tr></tbody></table>',
    )
    expect(descendants(data.content, "tbl")).toHaveLength(1)
    expect(descendants(data.content, "tblHeader")).toHaveLength(1)
    expect(attr(descendants(data.content, "gridSpan")[0], "val")).toBe("2")
    expect(descendants(data.content, "tblBorders")).toHaveLength(1)
    expect(descendants(data.content, "pStyle").every((style) => attr(style, "val") === "ResearchTable")).toBe(true)
  })
  test("inline formatting, Chinese, citations and multiline scripts survive; UI controls stay out", async () => {
    const data = await report(
      '<p>中文<strong>强调</strong><em>斜体</em><del>旧文</del><sup>1</sup><a href="https://example.org/source">引用</a></p><pre><code>print("中文")\n# 不是标题</code></pre><button>复制按钮</button><script>不可执行</script>',
    )
    const text = descendants(data.content, "t")
      .map((node) => node.textContent)
      .join("")
    expect(text).toContain("中文强调斜体旧文1引用")
    expect(text).toContain('print("中文")# 不是标题')
    expect(text).not.toContain("复制按钮")
    expect(text).not.toContain("不可执行")
    expect(descendants(data.content, "strike")).toHaveLength(1)
    expect(descendants(data.content, "br")).toHaveLength(1)
    expect(await data.zip.file("word/_rels/document.xml.rels")!.async("string")).toContain("https://example.org/source")
  })
})
