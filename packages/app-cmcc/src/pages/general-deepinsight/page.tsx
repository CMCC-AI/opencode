import { createEffect, createMemo, For, lazy, onCleanup, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { useDockApi } from "@/context/dockapi"
import { useLayout } from "@/context/layout"
import { NewSessionDesignView } from "@/components/session/session-new-design-view"
import { PromptSendButton } from "@/components/prompt-input/send-button"
import { showToast } from "@/utils/toast"
import {
  applyResearchEvent,
  array,
  consumeResearchSse,
  object,
  RESEARCH_API,
  RESEARCH_UPDATED,
  text,
  type ResearchCase,
  type ResearchDetail,
} from "./model"
import { ResearchResultView } from "./result-view"
import { ResearchFeaturedCases } from "./featured-cases"
import { prepareResearchCase, prepareResearchDraft, takeResearchCase, takeResearchDraft } from "./handoff"
import "./research.css"
import "./home-composer.css"

const ResearchReportEditor = lazy(() => import("./report-editor-view"))

export default function ResearchPage() {
  const dockapi = useDockApi()
  const layout = useLayout()
  const params = useParams<{ id?: string; caseCode?: string }>()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ start?: string; publish?: string }>()
  const [state, setState] = createStore({
    detail: undefined as ResearchDetail | undefined,
    loading: false,
    error: "",
    busy: false,
    query: takeResearchDraft(dockapi.user!.id) ?? "",
    uploadId: "",
    uploads: [] as NonNullable<ResearchDetail["conversationData"]["uploadedFiles"]>,
    cases: [] as ResearchCase[],
    loadingCase: "",
    tab: "process",
    mobile: "content",
    resume: "",
    plan: "",
    queries: "",
    planEditing: false,
    countdown: 60,
    edit: false,
    publish: false,
    caseName: "",
    caseDescription: "",
    cover: undefined as File | undefined,
    tick: Date.now(),
    small: window.matchMedia("(max-width:767px)").matches,
  })
  let generation = 0
  let abort: AbortController | undefined
  let poll: ReturnType<typeof setTimeout> | undefined
  let alive = true
  let input!: HTMLInputElement
  const media = window.matchMedia("(max-width:767px)")
  const updateMedia = () => setState("small", media.matches)
  media.addEventListener("change", updateMedia)
  onCleanup(() => media.removeEventListener("change", updateMedia))
  createEffect(() => {
    params.id
    params.caseCode
    if (state.small && layout.ready()) untrack(() => layout.sidebar.close())
  })
  const readOnly = () => !!params.caseCode
  const running = () => state.detail?.session.status === "running"
  const interrupted = () => state.detail?.session.status === "interrupted"
  const completed = () => state.detail?.session.status === "completed"
  const announce = () => window.dispatchEvent(new Event(RESEARCH_UPDATED))
  const request = <T,>(path: string, init?: RequestInit) => dockapi.research.request<T>(`${RESEARCH_API}${path}`, init)
  const clock = setInterval(() => {
    if (running()) setState("tick", Date.now())
  }, 1000)
  const elapsed = createMemo(() => {
    const session = state.detail?.session
    if (!session) return "--"
    if (state.detail?.conversationData.elapsedUnknown === true) return "--"
    const additional = running() ? Math.max(0, Math.floor((state.tick - Date.parse(session.updatedAt)) / 1000)) : 0
    const seconds = session.elapsedSeconds + additional
    return `${Math.floor(seconds / 60)}分${seconds % 60}秒`
  })
  const notifyError = (error: unknown) => {
    if (alive) setState("error", error instanceof Error ? error.message : String(error))
  }
  const action = async (work: () => Promise<void>) => {
    if (state.busy) return
    const own = generation
    setState({ busy: true, error: "" })
    try {
      await work()
    } catch (error) {
      if (own === generation) notifyError(error)
    } finally {
      if (alive && own === generation) setState("busy", false)
    }
  }
  const refresh = async (own: number) => {
    if (!params.id) return
    const detail = await request<ResearchDetail>(`/sessions/${encodeURIComponent(params.id)}`)
    if (!alive || own !== generation) return
    const previousStatus = state.detail?.session.status
    setState({ detail, tick: Date.now() })
    const interrupt = detail.conversationData.pendingInterrupt
    if (interrupt && !state.resume && !state.plan) {
      setState({
        resume: text(interrupt.recommended),
        plan: array(interrupt.research_plan).map(String).join("\n"),
        queries: array(interrupt.queries).map(String).join("\n"),
      })
    }
    if (detail.session.status === "running" && !abort)
      poll = setTimeout(() => void refresh(own).catch(notifyError), 3000)
    if (previousStatus !== detail.session.status) announce()
  }
  const run = async (resume?: unknown) => {
    const own = generation
    const id = params.id
    if (!id || readOnly()) return
    await dockapi.quota.checkResearch().catch((error) => {
      if (alive && own === generation)
        showToast({
          variant: "error",
          title: "暂时无法开始研究",
          description: error instanceof Error ? error.message : String(error),
          actions: [
            {
              label: "重新检查",
              onClick: () => {
                if (alive && own === generation) void action(() => run(resume))
              },
            },
          ],
        })
      throw error
    })
    if (!alive || own !== generation) return
    if (resume === undefined && search.start === "1") setSearch({ start: undefined }, { replace: true })
    if (poll) clearTimeout(poll)
    abort?.abort()
    const controller = new AbortController()
    abort = controller
    try {
      const response = await dockapi.research.fetch(
        `${RESEARCH_API}/sessions/${encodeURIComponent(id)}/${resume === undefined ? "stream" : "resume"}`,
        {
          method: "POST",
          ...(resume === undefined ? {} : { body: JSON.stringify({ resume }) }),
          signal: controller.signal,
        },
      )
      if (
        response.ok &&
        response.headers.get("content-type")?.includes("text/event-stream") &&
        alive &&
        own === generation &&
        state.detail
      ) {
        setState("detail", {
          ...state.detail,
          session: { ...state.detail.session, status: "running", updatedAt: new Date().toISOString() },
          conversationData: { ...state.detail.conversationData, pendingInterrupt: undefined },
        })
        announce()
      }
      await consumeResearchSse(response, (type, value) => {
        if (!alive || own !== generation || !state.detail) return
        setState("detail", applyResearchEvent(state.detail, type, value))
      })
    } finally {
      if (abort === controller) abort = undefined
      if (alive && own === generation && !controller.signal.aborted) await refresh(own)
    }
  }

  createEffect(() => {
    const id = params.id
    const code = params.caseCode
    const own = ++generation
    abort?.abort()
    abort = undefined
    if (poll) clearTimeout(poll)
    setState({
      detail: undefined,
      loading: !!(id || code),
      error: "",
      busy: false,
      edit: false,
      publish: false,
      resume: "",
      plan: "",
      queries: "",
      planEditing: false,
    })
    const load = async () => {
      if (code) {
        const detail =
          takeResearchCase(dockapi.user!.id, code) ??
          (await request<ResearchDetail>(`/cases/${encodeURIComponent(code)}`))
        if (alive && own === generation) setState("detail", detail)
      } else if (id) {
        await refresh(own)
        if (own === generation && state.detail?.session.status === "pending" && search.start === "1") {
          void action(() => run())
        }
      } else {
        const cases = await request<ResearchCase[]>("/cases")
        if (alive && own === generation) setState("cases", cases)
      }
    }
    void untrack(load)
      .catch((error) => {
        if (own === generation) notifyError(error)
      })
      .finally(() => {
        if (alive && own === generation) setState("loading", false)
      })
  })
  const onUpdate = () => {
    if (params.id && !abort && !state.loading) void refresh(generation).catch(notifyError)
  }
  createEffect(() => {
    if (search.publish !== "1" || !state.detail || !completed() || readOnly() || !dockapi.user?.casePublishAllowed)
      return
    setState({ publish: true, caseName: state.detail.session.title })
    setSearch({ publish: undefined }, { replace: true })
  })
  // History rename/delete refreshes only this product; it never reloads the whole app.
  const onHistoryMutation = (event: Event) => {
    if (event instanceof CustomEvent && event.detail === "mutation") onUpdate()
  }
  const confirmationKey = createMemo(() => {
    const pending = state.detail?.conversationData.pendingInterrupt
    if (!interrupted() || readOnly() || !pending) return ""
    if (pending.type !== "plan_confirmation" && !text(pending.recommended).trim()) return ""
    return `${params.id}:${JSON.stringify(pending)}`
  })
  let countedInterrupt = ""
  createEffect(() => {
    const key = confirmationKey()
    const paused = state.planEditing || state.busy
    if (!key) {
      countedInterrupt = ""
      return
    }
    if (key !== countedInterrupt) {
      countedInterrupt = key
      setState("countdown", 60)
    }
    if (paused || untrack(() => state.countdown <= 0)) return
    const pending = untrack(() => state.detail!.conversationData.pendingInterrupt!)
    const timer = setInterval(() => {
      setState("countdown", (value) => value - 1)
      if (state.countdown > 0) return
      clearInterval(timer)
      if (pending.type === "plan_confirmation") void resume(true)
      else {
        setState("resume", text(pending.recommended))
        void resume(false)
      }
    }, 1000)
    onCleanup(() => clearInterval(timer))
  })
  window.addEventListener(RESEARCH_UPDATED, onHistoryMutation)
  onCleanup(() => {
    alive = false
    generation++
    abort?.abort()
    if (poll) clearTimeout(poll)
    clearInterval(clock)
    window.removeEventListener(RESEARCH_UPDATED, onHistoryMutation)
  })

  const submit = () =>
    action(async () => {
      const session = await request<ResearchDetail["session"]>("/sessions", {
        method: "POST",
        body: JSON.stringify({ query: state.query, ...(state.uploadId ? { uploadId: state.uploadId } : {}) }),
      })
      announce()
      navigate(`/general-deepinsight/session/${session.id}?start=1`)
    })
  const upload = (files: FileList | null) =>
    action(async () => {
      if (!files?.length) return
      const form = new FormData()
      for (const file of files) form.append("files", file)
      if (state.uploadId) form.append("uploadId", state.uploadId)
      const result = await request<{ upload_id: string; files: typeof state.uploads }>("/files", {
        method: "POST",
        body: form,
      })
      setState({ uploadId: result.upload_id, uploads: result.files })
      input.value = ""
    })
  const removeUpload = (filename: string) =>
    action(async () => {
      await request(`/files?uploadId=${encodeURIComponent(state.uploadId)}&filename=${encodeURIComponent(filename)}`, {
        method: "DELETE",
      })
      setState(
        "uploads",
        state.uploads.filter((file) => file.saved_name !== filename),
      )
    })
  const resume = (confirm: boolean) =>
    action(() => {
      const pending = state.detail?.conversationData.pendingInterrupt
      if (!interrupted() || !pending) throw new Error("研究计划尚未进入可确认状态，请刷新任务详情")
      const plan = state.plan
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
      const queries = state.queries
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
      if (confirm && state.planEditing && (plan.length < 3 || queries.length < 1))
        throw new Error("研究计划至少需要 3 项，检索问题至少需要 1 项")
      const payload =
        pending?.type === "plan_confirmation"
          ? confirm
            ? state.planEditing
              ? { action: "confirm_with_edits", research_plan: plan, queries }
              : { action: "confirm" }
            : { action: "modify", modification: state.resume }
          : state.resume.trim()
      return run(payload)
    })
  const stop = () =>
    action(async () => {
      await request(`/sessions/${params.id}/stop`, { method: "POST" })
      abort?.abort()
      abort = undefined
      await refresh(generation)
    })
  const saveReport = async (content: string) => {
    await request(`/sessions/${params.id}/report`, {
      method: "PUT",
      body: JSON.stringify({ reportContent: content }),
    })
    await refresh(generation)
    announce()
    return state.detail?.reportContent ?? content
  }
  const rewrite = async (selected: string, requirements: string, signal: AbortSignal) => {
    await dockapi.quota.checkResearch()
    if (signal.aborted) throw new DOMException("操作已取消", "AbortError")
    const result = await request<{ rewritten_text: string }>(`/sessions/${params.id}/report/rewrite`, {
      method: "POST",
      body: JSON.stringify({ text: selected, requirements }),
      signal,
    })
    return result.rewritten_text
  }
  const download = async (path: string, filename: string, init?: RequestInit) => {
    const response = await dockapi.research.fetch(`${RESEARCH_API}${path}`, init)
    if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`)
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const markdown = () => {
    const url = URL.createObjectURL(
      new Blob([state.detail?.reportContent ?? ""], { type: "text/markdown;charset=utf-8" }),
    )
    const link = document.createElement("a")
    link.href = url
    link.download = "research-report.md"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const publish = () =>
    action(async () => {
      if (!state.cover) throw new Error("请选择案例封面")
      const form = new FormData()
      form.append("caseName", state.caseName)
      form.append("caseDescription", state.caseDescription)
      form.append("coverFile", state.cover)
      await request(`/cases/from-session/${params.id}`, { method: "POST", body: form })
      setState("publish", false)
      showToast({ title: "案例已发布", variant: "success" })
    })
  const deleteCase = (code: string) =>
    action(async () => {
      if (!window.confirm("删除该案例？")) return
      await request(`/cases/${code}`, { method: "DELETE" })
      setState(
        "cases",
        state.cases.filter((item) => item.caseCode !== code),
      )
      if (params.caseCode === code) navigate("/general-deepinsight")
    })
  const openCase = (code: string) =>
    action(async () => {
      setState("loadingCase", code)
      try {
        const detail = await request<ResearchDetail>(`/cases/${encodeURIComponent(code)}`)
        prepareResearchCase(dockapi.user!.id, code, detail)
        navigate(`/general-deepinsight/cases/${encodeURIComponent(code)}`)
      } finally {
        setState("loadingCase", "")
      }
    })

  const interrupt = () => (
    <div class="chat-input-container plan-card-host">
      <div class="interrupt-card plan-confirmation-card">
        <Show
          when={state.detail?.conversationData.pendingInterrupt?.type === "plan_confirmation"}
          fallback={
            <>
              <p>{text(state.detail?.conversationData.pendingInterrupt?.question)}</p>
              <div class="option-list">
                <For
                  each={array(state.detail?.conversationData.pendingInterrupt?.options).filter(
                    (option): option is string => typeof option === "string",
                  )}
                >
                  {(option) => (
                    <button
                      classList={{ selected: state.resume === option }}
                      onClick={() => setState("resume", option)}
                    >
                      {option}
                    </button>
                  )}
                </For>
              </div>
            </>
          }
        >
          <Show
            when={!state.planEditing}
            fallback={
              <>
                <div class="plan-edit-list">
                  <label>
                    研究计划
                    <textarea value={state.plan} onInput={(event) => setState("plan", event.currentTarget.value)} />
                  </label>
                </div>
                <label>
                  检索问题
                  <textarea value={state.queries} onInput={(event) => setState("queries", event.currentTarget.value)} />
                </label>
              </>
            }
          >
            <div class="plan-preview">
              <For each={state.plan.split("\n").filter(Boolean)}>
                {(item, index) => (
                  <div class="plan-row">
                    <b>{index() + 1}</b>
                    <span>{item}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
        <Show when={!state.planEditing}>
          <textarea
            class="interrupt-input"
            aria-label="补充信息或修改意见"
            value={state.resume}
            onInput={(event) => setState("resume", event.currentTarget.value)}
            placeholder="可填写修改意见，留空则直接确认当前研究计划"
          />
        </Show>
        <div class="interrupt-actions">
          <Show
            when={state.detail?.conversationData.pendingInterrupt?.type === "plan_confirmation"}
            fallback={
              <button
                class="confirm-btn"
                disabled={state.busy || !interrupted() || !state.resume.trim()}
                onClick={() => void resume(false)}
              >
                提交并继续
              </button>
            }
          >
            <button class="confirm-btn" disabled={state.busy || !interrupted()} onClick={() => void resume(true)}>
              {state.planEditing
                ? "编辑后确认"
                : !interrupted()
                  ? "等待就绪"
                  : state.countdown > 0
                    ? `确认（${state.countdown}秒）`
                    : "确认"}
            </button>
            <Show when={!state.planEditing}>
              <button
                class="secondary-btn"
                disabled={state.busy || !interrupted() || !state.resume.trim()}
                onClick={() => void resume(false)}
              >
                提交修改意见
              </button>
            </Show>
            <button
              class="secondary-btn"
              disabled={state.busy || !interrupted()}
              onClick={() => setState("planEditing", !state.planEditing)}
            >
              {state.planEditing ? "取消编辑" : "编辑计划"}
            </button>
          </Show>
          <button class="secondary-btn" disabled={state.busy} onClick={() => void stop()}>
            停止执行
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div class="general-research" classList={{ "general-research-home": !params.id && !params.caseCode }}>
      <Show when={state.loading}>
        <div class="research-empty" role="status">
          正在加载研究内容…
        </div>
      </Show>
      <Show when={state.detail && !state.loading}>
        <ResearchResultView
          detail={state.detail!}
          elapsed={elapsed()}
          busy={state.busy}
          readOnly={readOnly()}
          small={state.small}
          editing={state.edit}
          editor={
            <Show when={state.edit && state.detail}>
              <ResearchReportEditor
                content={state.detail!.reportContent}
                onSave={saveReport}
                onRewrite={rewrite}
                onExit={() => setState("edit", false)}
              />
            </Show>
          }
          interrupt={interrupt()}
          onNew={() => navigate("/general-deepinsight")}
          onSame={() => {
            prepareResearchDraft(dockapi.user!.id, state.detail?.session.query ?? "")
            navigate("/general-deepinsight")
          }}
          onStop={() => void stop()}
          onStart={() => void action(() => run())}
          onEdit={() => setState("edit", true)}
          onMarkdown={markdown}
          onPdf={() =>
            void action(() =>
              download("/export-pdf", "research-report.pdf", {
                method: "POST",
                body: JSON.stringify({ sessionId: params.id }),
              }),
            )
          }
          onHtml={() =>
            void action(() =>
              download("/export-html", "research-report.html", {
                method: "POST",
                body: JSON.stringify({ sessionId: params.id }),
              }),
            )
          }
        />
      </Show>
      <Show when={!params.id && !params.caseCode}>
        <NewSessionDesignView
          footer={
            <ResearchFeaturedCases
              cases={state.cases}
              busy={state.busy}
              loadingCase={state.loadingCase}
              canDelete={!!dockapi.user?.casePublishAllowed}
              onOpen={(code) => void openCase(code)}
              onDelete={(code) => void deleteCase(code)}
            />
          }
        >
          <section class="research-compose">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <textarea
                aria-label="研究问题"
                value={state.query}
                onInput={(event) => setState("query", event.currentTarget.value)}
                maxLength={20000}
                placeholder="请告诉您要研究的问题？"
              />
              <div class="research-upload-chips">
                <For each={state.uploads}>
                  {(file) => (
                    <span>
                      {file.original_filename}
                      <button
                        type="button"
                        title="移除资料"
                        disabled={state.busy}
                        onClick={() => void removeUpload(file.saved_name)}
                      >
                        <Icon name="close" />
                      </button>
                    </span>
                  )}
                </For>
              </div>
              <div class="research-compose-toolbar">
                <input
                  ref={input}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.json"
                  class="sr-only"
                  onChange={(event) => void upload(event.currentTarget.files)}
                />
                <button
                  type="button"
                  title="上传文件"
                  aria-label="上传文件"
                  disabled={state.busy}
                  onClick={() => input.click()}
                >
                  <Icon name="plus" />
                </button>
                <PromptSendButton
                  mode="send"
                  type="submit"
                  aria-label="开始研究"
                  title="开始研究"
                  disabled={state.busy || !state.query.trim()}
                />
              </div>
            </form>
          </section>
        </NewSessionDesignView>
      </Show>
      <Show when={state.publish}>
        <div class="research-modal-backdrop">
          <section class="research-modal" role="dialog" aria-modal="true" aria-label="发布研究案例">
            <header>
              <h2>添加至案例库</h2>
              <button title="关闭" disabled={state.busy} onClick={() => setState("publish", false)}>
                <Icon name="close" />
              </button>
            </header>
            <label>
              案例名称
              <input
                value={state.caseName}
                maxLength={255}
                onInput={(event) => setState("caseName", event.currentTarget.value)}
              />
            </label>
            <label>
              案例说明
              <textarea
                value={state.caseDescription}
                maxLength={255}
                onInput={(event) => setState("caseDescription", event.currentTarget.value)}
              />
            </label>
            <label>
              案例封面
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => setState("cover", event.currentTarget.files?.[0])}
              />
            </label>
            <div class="research-actions">
              <button
                class="primary"
                disabled={state.busy || !state.cover || !state.caseName.trim()}
                onClick={() => void publish()}
              >
                确认发布
              </button>
            </div>
          </section>
        </div>
      </Show>
    </div>
  )
}
