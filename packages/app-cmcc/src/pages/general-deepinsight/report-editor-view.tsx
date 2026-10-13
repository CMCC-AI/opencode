import { createEffect, createMemo, For, onCleanup, Show, untrack } from "solid-js"
import { Portal } from "solid-js/web"
import { createStore } from "solid-js/store"
import { useBeforeLeave } from "@solidjs/router"
import { showToast } from "@/utils/toast"
import { containsMarkdownHeading, parseReportMarkdown, rebuildReportMarkdown, replaceTextRange } from "./report-editor"
import { citationNumbers } from "./report-citations"
import { ReportMarkdown } from "./report-markdown"
import "./report-editor.css"

type Revision = { start: number; end: number; original: string; generated: string; loading: boolean; error: string }

export default function ResearchReportEditor(props: {
  content: string
  onSave: (content: string) => Promise<string>
  onRewrite: (text: string, requirements: string, signal: AbortSignal) => Promise<string>
  onExit: () => void
}) {
  const [state, setState] = createStore({
    source: untrack(() => props.content),
    active: "",
    draft: "",
    instruction: "",
    start: -1,
    end: -1,
    point: undefined as { x: number; y: number } | undefined,
    left: 12,
    top: 12,
    pinned: false,
    scrollTop: 0,
    scrollLeft: 0,
    revision: undefined as Revision | undefined,
    saving: false,
    error: "",
  })
  let textarea: HTMLTextAreaElement | undefined
  let generated: HTMLTextAreaElement | undefined
  let toolbar: HTMLDivElement | undefined
  let rewrite: AbortController | undefined
  let alive = true
  const document = createMemo(() => parseReportMarkdown(state.source))
  const numbers = createMemo(() => citationNumbers(state.source))
  const active = createMemo(() => document().chapters.find((chapter) => chapter.id === state.active))
  const dirty = () => !!active() && (state.draft !== active()!.body || !!state.revision)
  const selection = () => state.start >= 0 && state.end > state.start && !!state.point && !state.revision
  const clearSelection = () => setState({ start: -1, end: -1, point: undefined, pinned: false })
  const abortRewrite = () => {
    rewrite?.abort()
    rewrite = undefined
  }
  const reset = () => {
    abortRewrite()
    clearSelection()
    setState({ active: "", draft: "", revision: undefined, instruction: "", error: "" })
  }
  const discard = () => !dirty() || window.confirm("当前章节修改尚未保存，继续后将丢失，是否放弃修改？")
  const exit = () => {
    if (state.saving || !discard()) return
    reset()
    props.onExit()
  }
  useBeforeLeave((event) => {
    if (state.saving || !discard()) event.preventDefault()
    else abortRewrite()
  })
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!dirty() && !state.saving) return
    event.preventDefault()
    event.returnValue = ""
  }
  window.addEventListener("beforeunload", beforeUnload)
  onCleanup(() => {
    alive = false
    abortRewrite()
    window.removeEventListener("beforeunload", beforeUnload)
    window.removeEventListener("resize", positionToolbar)
    window.removeEventListener("scroll", hideSelection, true)
  })
  function resize(element: HTMLTextAreaElement | undefined, minimum = 180) {
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${Math.max(minimum, element.scrollHeight)}px`
  }
  function positionToolbar() {
    const point = state.point
    if (!point || !toolbar) return
    const width = Math.min(430, window.innerWidth - 24)
    setState({
      left: Math.max(12, Math.min(window.innerWidth - width - 12, point.x - width / 2)),
      top: Math.max(12, Math.min(window.innerHeight - toolbar.offsetHeight - 12, point.y - toolbar.offsetHeight - 10)),
    })
  }
  function hideSelection(event: Event) {
    if (event.target !== textarea) clearSelection()
  }
  window.addEventListener("resize", positionToolbar)
  window.addEventListener("scroll", hideSelection, true)
  createEffect(() => {
    if (selection()) queueMicrotask(positionToolbar)
  })
  createEffect(() => {
    state.draft
    if (!state.revision) queueMicrotask(() => resize(textarea))
  })
  createEffect(() => {
    state.revision?.generated
    queueMicrotask(() => resize(generated, 48))
  })
  const select = (id: string) => {
    if (state.saving || state.active === id || !discard()) return
    reset()
    const chapter = document().chapters.find((chapter) => chapter.id === id)
    if (chapter) setState({ active: id, draft: chapter.body })
  }
  const capture = (event: Event) => {
    const element = event.currentTarget as HTMLTextAreaElement
    if (element.selectionStart === element.selectionEnd) return clearSelection()
    const rect = element.getBoundingClientRect()
    setState({
      start: element.selectionStart,
      end: element.selectionEnd,
      pinned: false,
      scrollTop: element.scrollTop,
      scrollLeft: element.scrollLeft,
      point:
        event instanceof MouseEvent
          ? { x: event.clientX, y: event.clientY }
          : { x: rect.left + rect.width / 2, y: Math.max(rect.top, 60) },
    })
  }
  const polish = async () => {
    if (state.revision || state.saving || !selection()) return
    if (!state.instruction.trim()) return setState("error", "请输入修改要求")
    const start = state.start
    const end = state.end
    const original = state.draft.slice(start, end)
    if (!original.trim()) return setState("error", "请选择需要修改的文字")
    const controller = new AbortController()
    rewrite = controller
    setState({ revision: { start, end, original, generated: "", loading: true, error: "" }, error: "" })
    clearSelection()
    try {
      const content = await props.onRewrite(original, state.instruction.trim(), controller.signal)
      if (!alive || controller.signal.aborted || rewrite !== controller) return
      if (!content.trim()) throw new Error("AI 生成内容为空，请重新发起")
      setState("revision", { start, end, original, generated: content, loading: false, error: "" })
    } catch (error) {
      if (alive && !controller.signal.aborted && rewrite === controller)
        setState("revision", {
          start,
          end,
          original,
          generated: "",
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        })
    } finally {
      if (rewrite === controller) rewrite = undefined
    }
  }
  const apply = () => {
    const revision = state.revision
    if (!revision || revision.loading || revision.error) return
    if (!revision.generated.trim()) return setState("error", "AI 生成内容为空")
    if (containsMarkdownHeading(revision.generated))
      return setState("error", "AI 生成内容包含 Markdown 标题，请修改后再应用")
    setState({
      draft: replaceTextRange(state.draft, revision.start, revision.end, revision.generated),
      revision: undefined,
      instruction: "",
      error: "",
    })
  }
  const save = async () => {
    if (!active() || state.saving || state.revision) return
    if (containsMarkdownHeading(state.draft)) return setState("error", "章节标题不可修改，请只编辑正文内容")
    if (!window.confirm("确认保存本章修改吗？保存后将替换当前文字报告内容。")) return
    const content = rebuildReportMarkdown(document(), state.active, state.draft)
    setState({ saving: true, error: "" })
    try {
      const saved = await props.onSave(content)
      if (!alive) return
      reset()
      setState("source", saved)
      showToast({ title: "本章修改已保存", variant: "success" })
    } catch (error) {
      if (alive) setState("error", error instanceof Error ? error.message : String(error))
    } finally {
      if (alive) setState("saving", false)
    }
  }
  return (
    <div class="report-editing-shell gd-report-editing-shell">
      <button class="report-edit-control" disabled={state.saving} onClick={exit}>
        退出修改
      </button>
      <div class="gd-report-editor">
        <div class="editor-toolbar">
          <div class="editor-title">修改文章</div>
        </div>
        <div class="chapter-list">
          <For each={document().chapters}>
            {(chapter) => (
              <section class="chapter-section" classList={{ active: state.active === chapter.id }}>
                <div class={`chapter-heading level-${chapter.headingLevel ?? 0}`}>{chapter.headingText || "前言"}</div>
                <Show when={chapter.body.trim()}>
                  <Show
                    when={state.active === chapter.id}
                    fallback={
                      <div class="chapter-card chapter-preview-card" onClick={() => select(chapter.id)}>
                        <div class="chapter-preview markdown-body">
                          <ReportMarkdown text={chapter.body} numbers={numbers()} />
                        </div>
                        <button
                          class="chapter-edit-button"
                          disabled={state.saving}
                          onClick={(event) => {
                            event.stopPropagation()
                            select(chapter.id)
                          }}
                        >
                          编辑本章
                        </button>
                      </div>
                    }
                  >
                    <div class="chapter-card chapter-edit-card">
                      <Show
                        when={state.revision}
                        fallback={
                          <div class="editor-textarea-wrap">
                            <textarea
                              ref={(element) => {
                                textarea = element
                                queueMicrotask(() => resize(element))
                              }}
                              class="chapter-textarea"
                              aria-label="章节 Markdown 正文"
                              disabled={state.saving}
                              value={state.draft}
                              onInput={(event) => {
                                clearSelection()
                                setState({ draft: event.currentTarget.value, error: "" })
                              }}
                              onSelect={capture}
                              onMouseUp={capture}
                              onKeyUp={capture}
                              onScroll={(event) =>
                                setState({
                                  scrollTop: event.currentTarget.scrollTop,
                                  scrollLeft: event.currentTarget.scrollLeft,
                                })
                              }
                            />
                            <Show when={state.pinned && selection()}>
                              <div class="selection-highlight-viewport" aria-hidden="true">
                                <pre
                                  class="selection-highlight-content"
                                  style={{ transform: `translate(${-state.scrollLeft}px, ${-state.scrollTop}px)` }}
                                >
                                  <span>{state.draft.slice(0, state.start)}</span>
                                  <mark>{state.draft.slice(state.start, state.end)}</mark>
                                  <span>{state.draft.slice(state.end)}</span>
                                </pre>
                              </div>
                            </Show>
                          </div>
                        }
                      >
                        {(revision) => (
                          <div class="ai-revision-panel">
                            <div class="revision-title">AI 修改预览</div>
                            <div class="revision-document">
                              <span>{state.draft.slice(0, revision().start)}</span>
                              <del class="revision-original">{revision().original}</del>
                              <Show when={revision().loading}>
                                <span class="revision-status">AI 正在生成...</span>
                              </Show>
                              <Show when={!revision().loading && !revision().error}>
                                <textarea
                                  ref={(element) => {
                                    generated = element
                                    queueMicrotask(() => resize(element, 48))
                                  }}
                                  class="revision-generated"
                                  aria-label="AI 生成内容"
                                  value={revision().generated}
                                  onInput={(event) => setState("revision", "generated", event.currentTarget.value)}
                                />
                              </Show>
                              <span>{state.draft.slice(revision().end)}</span>
                            </div>
                            <Show when={revision().error}>
                              <div class="revision-error" role="alert">
                                {revision().error}
                              </div>
                            </Show>
                            <div class="revision-actions">
                              <button
                                class="secondary-button"
                                onClick={() => {
                                  abortRewrite()
                                  setState({ revision: undefined, instruction: "", error: "" })
                                }}
                              >
                                取消 AI 修改
                              </button>
                              <button
                                class="primary-button"
                                disabled={revision().loading || !!revision().error}
                                onClick={apply}
                              >
                                应用 AI 修改
                              </button>
                            </div>
                          </div>
                        )}
                      </Show>
                      <Show when={state.error}>
                        <div class="editor-error" role="alert">
                          {state.error}
                        </div>
                      </Show>
                      <div class="chapter-actions">
                        <button class="secondary-button" disabled={state.saving} onClick={reset}>
                          取消
                        </button>
                        <button
                          class="primary-button"
                          disabled={state.saving || !!state.revision}
                          onClick={() => void save()}
                        >
                          {state.saving ? "保存中..." : "确认本章修改"}
                        </button>
                      </div>
                    </div>
                  </Show>
                </Show>
              </section>
            )}
          </For>
        </div>
      </div>
      <Show when={selection()}>
        <Portal>
          <div
            ref={toolbar}
            class="gd-report-selection-toolbar"
            style={{ left: `${state.left}px`, top: `${state.top}px` }}
          >
            <input
              class="ai-instruction-input"
              aria-label="AI 修改需求"
              placeholder="请输入修改要求"
              value={state.instruction}
              onPointerDown={() => setState("pinned", true)}
              onFocus={() => setState("pinned", true)}
              onInput={(event) => setState("instruction", event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.isComposing) {
                  event.preventDefault()
                  void polish()
                }
              }}
            />
            <button class="ai-polish-button" onClick={() => void polish()}>
              AI 润色
            </button>
          </div>
        </Portal>
      </Show>
    </div>
  )
}
