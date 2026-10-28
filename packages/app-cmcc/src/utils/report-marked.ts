import { Marked } from "marked"
import markedKatex from "marked-katex-extension"

export const reportMathOptions = {
  throwOnError: false,
  trust: false,
  maxSize: 20,
  maxExpand: 1000,
  strict: "ignore" as const,
}

export function createReportMarked() {
  const math = markedKatex({ ...reportMathOptions, nonStandard: true })
  for (const extension of math.extensions ?? []) {
    if (extension.name === "inlineKatex" && "tokenizer" in extension && extension.tokenizer) {
      const tokenizer = extension.tokenizer
      extension.tokenizer = function (source, tokens) {
        const token = tokenizer.call(this, source, tokens)
        if (
          token &&
          !token.displayMode &&
          (/^\$\s/.test(token.raw) ||
            /\s\$$/.test(token.raw) ||
            token.raw.includes("`") ||
            /^\d/.test(source.slice(token.raw.length)))
        )
          return undefined
        return token
      }
    }
    if ("renderer" in extension && extension.renderer) {
      const renderer = extension.renderer
      extension.renderer = function (token) {
        const html = renderer.call(this, token)
        // Legacy report citation linkers must not rewrite indices inside formula annotations.
        return typeof html === "string" ? html.replaceAll("[", "&#91;").replaceAll("]", "&#93;") : html
      }
    }
  }
  return new Marked({ gfm: true, breaks: false, async: false }).use(math)
}
