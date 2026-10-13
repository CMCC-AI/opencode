import { describe, expect, test } from "bun:test"
import { containsMarkdownHeading, parseReportMarkdown, rebuildReportMarkdown, replaceTextRange } from "./report-editor"

describe("report chapter editor", () => {
  test("round trips titles, leading prose, CRLF, tables and fenced code exactly", () => {
    const report =
      "前言\r\n\r\n# 标题\r\n\r\n## 摘要\r\n正文\r\n```md\r\n# 代码中的标题\r\n```\r\n\r\n### 1.1 分析\r\n|项目|结论|\r\n|---|---|\r\n|甲|乙|\r\n## 结尾"
    const document = parseReportMarkdown(report)
    expect(document.chapters.map((chapter) => chapter.headingText)).toEqual([
      "前言",
      "标题",
      "摘要",
      "1.1 分析",
      "结尾",
    ])
    expect(rebuildReportMarkdown(document, "missing", "unused")).toBe(report)
    expect(document.chapters[2]!.body).toContain("# 代码中的标题")
  })
  test("saves only selected body and retains every original heading", () => {
    const report = "\n# 标题\n\n## 第一章\n同文\n\n## 第二章\n同文\n"
    const document = parseReportMarkdown(report)
    expect(rebuildReportMarkdown(document, "chapter-2", "新文\n")).toBe(
      "\n# 标题\n\n## 第一章\n同文\n\n## 第二章\n新文\n",
    )
    expect(rebuildReportMarkdown(document, "missing", "")).toBe(report)
  })
  test("headless reports become one editable chapter and empty title-only chapters survive", () => {
    const report = "没有标题的正文"
    const document = parseReportMarkdown(report)
    expect(document.chapters).toHaveLength(1)
    expect(rebuildReportMarkdown(document, "chapter-0", "修改正文")).toBe("修改正文")
    expect(rebuildReportMarkdown(parseReportMarkdown("# 仅标题"), "chapter-0", "")).toBe("# 仅标题")
  })
  test("rejects real Markdown headings but not fenced scripts or inline hashes", () => {
    expect(containsMarkdownHeading("正文\n## 新增章节")).toBe(true)
    expect(containsMarkdownHeading("C# 和 #标签\n```python\n# 注释\n```\n~~~md\n## 样例\n~~~")).toBe(false)
  })
  test("polishes the selected occurrence without replacing matching text elsewhere", () => {
    const report = "相同文字，然后相同文字，结束。"
    const start = report.lastIndexOf("相同文字")
    expect(replaceTextRange(report, start, start + 4, "新文字")).toBe("相同文字，然后新文字，结束。")
  })
})
