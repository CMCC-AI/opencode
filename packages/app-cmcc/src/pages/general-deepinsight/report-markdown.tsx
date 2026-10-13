import { createEffect, createMemo, onCleanup, Show } from "solid-js"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { citationNumbers, renderCitations } from "./report-citations"
import "./report-citations.css"

export function ReportMarkdown(props: { text: string; streaming?: boolean; numbers?: ReadonlyMap<string, number> }) {
  const numbers = createMemo(() => (props.streaming ? undefined : (props.numbers ?? citationNumbers(props.text))))
  return (
    <Show
      when={numbers()?.size ? numbers() : undefined}
      fallback={<Markdown text={props.text} streaming={props.streaming} />}
    >
      {(numbers) => <CitedMarkdown text={props.text} numbers={numbers()} />}
    </Show>
  )
}

function CitedMarkdown(props: { text: string; numbers: ReadonlyMap<string, number> }) {
  let root!: HTMLDivElement
  createEffect(() => {
    const numbers = props.numbers
    renderCitations(root, numbers)
    const observer = new MutationObserver(() => renderCitations(root, numbers))
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    onCleanup(() => observer.disconnect())
  })
  return (
    <div class="gd-citation-markdown" ref={root}>
      <Markdown text={props.text} />
    </div>
  )
}
