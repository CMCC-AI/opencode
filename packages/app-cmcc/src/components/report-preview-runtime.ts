import echarts from "echarts/dist/echarts.min.js"
import katex from "katex"
import renderMathInElement from "katex/contrib/auto-render"
import katexCss from "katex/dist/katex.min.css?inline"
import { createReportMarked, reportMathOptions } from "../utils/report-marked"

Object.assign(window, { echarts, marked: createReportMarked(), katex })

const style = document.createElement("style")
style.id = "cmcc-report-math-style"
style.textContent = katexCss + "\n.katex-display{max-width:100%;overflow-x:auto;overflow-y:hidden}"
;(document.head ?? document.documentElement).append(style)

const render = () => {
  if (!document.body) return
  // Single-dollar formulas are handled by the Markdown tokenizer, with currency guards.
  renderMathInElement(document.body, {
    ...reportMathOptions,
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "\\[", right: "\\]", display: true },
      { left: "\\(", right: "\\)", display: false },
    ],
    ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
    ignoredClasses: ["katex", "katex-display", "katex-error"],
  })
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true })
else render()
