import DOMPurify from "dompurify"
import { marked } from "marked"

export function renderMarkdown(source: string) {
  return DOMPurify.sanitize(marked.parse(source, { async: false, breaks: true, gfm: true }), {
    USE_PROFILES: { html: true },
    SANITIZE_NAMED_PROPS: true,
    FORBID_TAGS: ["style"],
    FORBID_CONTENTS: ["script", "style"],
  })
}
