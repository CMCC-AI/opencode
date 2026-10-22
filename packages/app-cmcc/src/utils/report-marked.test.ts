import { describe, expect, test } from "bun:test"
import { createReportMarked } from "./report-marked"

describe("isolated HTML report Markdown", () => {
  test("renders report subheadings, tables, inline and display formulas", () => {
    const html = createReportMarked().parse(
      String.raw`### 1.1 Report

| Field | Value |
| --- | --- |
| PDE | $\mathcal{N}[u]$ |

$$\frac{\partial u}{\partial t}=0$$`,
      { async: false },
    )
    expect(html).toContain("<h3>1.1 Report</h3>")
    expect(html).toContain("<table>")
    expect(html).toContain('class="katex"')
    expect(html).toContain('class="katex-display"')
    expect(html).not.toContain("### 1.1")
  })

  test.each(["$100 and $200", "$100-$200", "$30.00", "US$200", String.raw`\$100 and \$200`])(
    "does not parse currency as formulas: %s",
    (text) => expect(createReportMarked().parse(text, { async: false })).not.toContain('class="katex"'),
  )

  test("preserves currency around a real formula", () => {
    const html = createReportMarked().parse("Cost $100, formula $x^2$, budget $200.", { async: false })
    const node = document.createElement("div")
    node.innerHTML = html
    expect(node.querySelectorAll(".katex").length).toBe(1)
    expect(node.textContent).toContain("Cost $100")
    expect(node.textContent).toContain("budget $200")
  })

  test("leaves code blocks and inline code unchanged", () => {
    const html = createReportMarked().parse("`$x$`\n\n```text\n### Example\n$$x^2$$\n```\n\n$x^2$", { async: false })
    const node = document.createElement("div")
    node.innerHTML = html
    expect(node.querySelectorAll(".katex").length).toBe(1)
    expect(node.querySelector("pre code")?.textContent).toContain("$$x^2$$")
    expect(node.querySelector("code")?.textContent).toBe("$x$")
  })

  test("does not join a currency range to a later inline code delimiter", () => {
    const node = document.createElement("div")
    node.innerHTML = createReportMarked().parse("Cost $100-$200. Inline code: `$x$`.", { async: false })
    expect(node.querySelectorAll(".katex").length).toBe(0)
    expect(node.textContent).toContain("Cost $100-$200")
    expect(node.querySelector("code")?.textContent).toBe("$x$")
  })

  test("protects math indices from legacy citation rewriting without changing their text", () => {
    const html = createReportMarked().parse("$a[1]+b[2]$", { async: false })
    expect(html).not.toContain("[1]")
    const node = document.createElement("div")
    node.innerHTML = html
    expect(node.querySelector("annotation")?.textContent).toBe("a[1]+b[2]")
  })

  test("does not enable trusted HTML or URL commands in formulas", () => {
    const html = createReportMarked().parse(String.raw`$\href{https://untrusted.invalid}{x}$`, { async: false })
    expect(html).not.toContain('<a href="https://untrusted.invalid')
  })

  test("invalid formulas remain visible and do not abort report rendering", () => {
    const html = createReportMarked().parse(
      String.raw`$\frac{a}{$

Remaining report.`,
      { async: false },
    )
    expect(html).toContain("Remaining report.")
    expect(html).toContain("frac")
  })

  test("keeps report parser options isolated", () => {
    const first = createReportMarked()
    const second = createReportMarked()
    first.setOptions({ gfm: false })
    expect(second.parse("| A |\n| --- |\n| B |", { async: false })).toContain("<table>")
  })
})
