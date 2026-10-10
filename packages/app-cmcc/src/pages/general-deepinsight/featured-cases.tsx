import { createEffect, createMemo, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode-ai/ui/icon"
import { dockApiUrl } from "@/context/dockapi"
import type { ResearchCase } from "./model"
import "./featured-cases.css"

export function ResearchFeaturedCases(props: {
  cases: ResearchCase[]
  busy: boolean
  loadingCase: string
  canDelete: boolean
  onOpen: (code: string) => void
  onDelete: (code: string) => void
}) {
  const [state, setState] = createStore({ more: false })
  const sorted = createMemo(() =>
    [...props.cases].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)),
  )
  let dialog!: HTMLDialogElement
  createEffect(() => {
    if (state.more) dialog.showModal()
    if (!state.more) dialog.close()
  })
  onCleanup(() => dialog.close())

  const card = (item: ResearchCase) => (
    <article class="featured-item">
      <button
        class="featured-card"
        type="button"
        disabled={props.busy || !!props.loadingCase}
        onClick={() => props.onOpen(item.caseCode)}
      >
        <div class="case-cover">
          <Show when={item.coverUrl} fallback={<div class="case-cover-fallback">{item.caseName.slice(0, 1)}</div>}>
            <img src={dockApiUrl(item.coverUrl)} alt={item.caseName} loading="lazy" />
          </Show>
          <Show when={item.caseDescription}>
            <div class="case-tag" title={item.caseDescription}>
              {item.caseDescription}
            </div>
          </Show>
          <Show when={props.loadingCase === item.caseCode}>
            <span class="research-case-loading" role="status">
              正在加载…
              <span />
            </span>
          </Show>
        </div>
        <div class="case-name" title={item.caseName}>
          {item.caseName}
        </div>
      </button>
      <Show when={props.canDelete}>
        <button
          class="featured-delete"
          type="button"
          title="删除案例"
          aria-label={`删除案例：${item.caseName}`}
          disabled={props.busy || !!props.loadingCase}
          onClick={() => props.onDelete(item.caseCode)}
        >
          <Icon name="trash" />
        </button>
      </Show>
    </article>
  )

  return (
    <section class="research-featured featured-cases" aria-label="精选案例" hidden={!sorted().length}>
      <div class="featured-header">
        <h2>精选案例</h2>
        <Show when={sorted().length > 5}>
          <button class="featured-more-btn" type="button" onClick={() => setState("more", true)}>
            更多
          </button>
        </Show>
      </div>
      <div class="featured-list">
        <For each={sorted().slice(0, 5)}>{card}</For>
      </div>
      <dialog
        ref={dialog}
        class="featured-dialog-mask"
        aria-labelledby="research-featured-dialog-title"
        onCancel={() => setState("more", false)}
        onClose={() => setState("more", false)}
        onClick={(event) => {
          if (event.target === dialog && !props.loadingCase) setState("more", false)
        }}
      >
        <div class="featured-dialog">
          <div class="featured-dialog-header">
            <h3 id="research-featured-dialog-title">更多精选案例</h3>
            <button
              class="featured-dialog-close"
              type="button"
              aria-label="关闭"
              onClick={() => setState("more", false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div class="featured-dialog-list">
            <Show when={state.more}>
              <For each={sorted()}>{card}</For>
            </Show>
          </div>
        </div>
      </dialog>
    </section>
  )
}
