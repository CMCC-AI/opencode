import { For, Show, createEffect, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useDockApi, asOpenCodeSession, type MstockSource, type DockApiSession } from "@/context/dockapi"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useServerSync } from "@/context/server-sync"
import { useServer } from "@/context/server"
import { useLocal } from "@/context/local"
import { useLayout } from "@/context/layout"
import { useTabs } from "@/context/tabs"
import { DialogSelectModel } from "@/components/dialog-select-model"
import { CmccPageBackground } from "@/components/cmcc-page-background"
import { ACCEPTED_FILE_TYPES } from "@/constants/file-picker"
import { attachmentMime } from "@/components/prompt-input/files"
import {
  fileBase64,
  isWordDocument,
  safeUploadedFilename,
  wordAttachmentText,
} from "@/components/prompt-input/word-documents"
import { sendFollowupDraft } from "@/components/prompt-input/submit"
import { cmccArtifactWorkspace, cmccEnsureWorkspace, cmccArtifactSystemPrompt } from "@/utils/cmcc-workspace"
import { cmccWorkspaceRelativePath } from "@/utils/cmcc-artifact-paths"
import { Identifier } from "@/utils/id"
import { uuid } from "@/utils/uuid"
import { MSTOCK_DIMENSIONS, mstockPrompt } from "./input"
import sourceStockIcon from "@/assets/mstock/source-stock.svg?url"
import uploadCloudIcon from "@/assets/mstock/upload-cloud.svg?url"
import "./form.css"

type Upload = { id: string; name: string; size: number; mime: string; file?: File; path?: string }
type Attempt = {
  binding: DockApiSession
  directory: string
  messageID: string
  sources: string[]
  uploads: Omit<Upload, "file">[]
}

export default function MstockForm() {
  const dockapi = useDockApi()
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const server = useServer()
  const local = useLocal()
  const layout = useLayout()
  const tabs = useTabs()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ fresh?: string }>()
  const dialog = useDialog()
  const [state, setState] = createStore({
    sources: [] as MstockSource[],
    selected: [] as string[],
    uploads: [] as Upload[],
    dimensions: [...MSTOCK_DIMENSIONS],
    nextPage: null as number | null,
    loading: false,
    busy: false,
    error: "",
    sourceError: "",
    dragging: false,
    attempt: undefined as Attempt | undefined,
  })
  const scope = `${dockapi.user?.id}:${server.key}:${sdk().directory}`
  const storageKey = `mstock-input:${scope}`
  let disposed = false
  let generation = 0
  let input: HTMLInputElement | undefined
  const current = () => !disposed && scope === `${dockapi.user?.id}:${server.key}:${sdk().directory}`
  const remember = () => {
    if (!state.attempt) return
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          ...state.attempt,
          sources: state.selected,
          uploads: state.uploads.map(({ file, ...item }) => item),
        }),
      )
    } catch {
      /* Retry remains available in this page when browser storage is full. */
    }
  }
  const clearAttempt = () => {
    sessionStorage.removeItem(storageKey)
    setState("attempt", undefined)
    setState("uploads", (items) => items.filter((item) => item.file).map((item) => ({ ...item, path: undefined })))
  }
  const open = (binding: DockApiSession) => {
    clearAttempt()
    const session = asOpenCodeSession(binding.openCodeSession)
    if (session) sync().session.remember(session)
    const tab = tabs.addSessionTab({ server: server.key, sessionId: binding.openCodeSessionId })
    tabs.select(tab)
  }
  const load = async (page = 0) => {
    const run = ++generation
    setState({ loading: true, sourceError: "" })
    try {
      const result = await dockapi.mstock.sources(page)
      if (!current() || run !== generation) return
      setState(
        "sources",
        page === 0
          ? result.items
          : [
              ...state.sources,
              ...result.items.filter(
                (item) => !state.sources.some((old) => old.businessSessionId === item.businessSessionId),
              ),
            ],
      )
      setState("nextPage", result.nextPage)
    } catch (error) {
      if (current() && run === generation) setState("sourceError", String(error))
    } finally {
      if (current() && run === generation) setState("loading", false)
    }
  }
  onMount(() => {
    if (search.fresh === "1") {
      sessionStorage.removeItem(storageKey)
      setSearch({ fresh: undefined }, { replace: true })
    }
    try {
      const saved: Attempt = JSON.parse(sessionStorage.getItem(storageKey) ?? "null")
      if (
        saved?.binding?.agentType === "mstock" &&
        saved.binding.directoryPath === sdk().directory &&
        saved.messageID &&
        Array.isArray(saved.sources) &&
        Array.isArray(saved.uploads)
      )
        setState({ attempt: saved, selected: saved.sources, uploads: saved.uploads })
    } catch {
      sessionStorage.removeItem(storageKey)
    }
    void load()
  })
  onCleanup(() => {
    disposed = true
    generation++
  })
  createEffect(() => {
    if (scope !== `${dockapi.user?.id}:${server.key}:${sdk().directory}`) {
      sessionStorage.removeItem(storageKey)
      navigate("/expert", { replace: true })
    }
  })

  const append = async (files: File[]) => {
    if (state.busy) return
    setState("error", "")
    for (const file of files) {
      const mime = await attachmentMime(file)
      if (!current()) return
      if (!mime) {
        setState("error", `不支持的文件格式：${file.name}`)
        continue
      }
      if (isWordDocument(file, mime) && file.size > 25 * 1024 * 1024) {
        setState("error", "Word 文件不能超过 25 MB")
        continue
      }
      const existing = state.uploads.find((item) => item.name === file.name && item.size === file.size)
      if (existing) {
        if (!existing.file && !existing.path) setState("uploads", (item) => item.id === existing.id, "file", file)
        continue
      }
      if (state.attempt) {
        setState("error", "本次任务已创建，请补选原文件，或点击重新选择后发起新任务")
        continue
      }
      setState("uploads", (items) => [...items, { id: uuid(), name: file.name, size: file.size, mime, file }])
    }
  }
  const start = async () => {
    if (state.busy || state.selected.length + state.uploads.length < 2) return
    const model = local.model.current()
    if (!model) {
      dialog.show(() => <DialogSelectModel />)
      return
    }
    setState({ busy: true, error: "" })
    try {
      const agents = (await sdk().client.app.agents()).data ?? []
      if (!agents.some((agent) => agent.name === "mstock/mstock")) throw new Error("后端尚未加载多股对比 Agent")
      if (!current()) return
      if (!state.attempt) {
        const directory = cmccArtifactWorkspace(sdk().directory)
        if (!directory) throw new Error("当前账号工作区未准备完成")
        await cmccEnsureWorkspace(
          directory,
          (path) => sdk().client.file.createDirectory({ path }, { throwOnError: true }),
          sdk().scope,
        )
        const names = [
          ...state.selected.map((id) => state.sources.find((item) => item.businessSessionId === id)?.title ?? id),
          ...state.uploads.map((file) => file.name),
        ]
        const binding = await dockapi.sessions.create({
          agentType: "mstock",
          query: `多股对比：${names.join("、")}`,
          artifactDirectory: directory,
        })
        if (!current()) return
        setState("attempt", {
          binding,
          directory,
          messageID: Identifier.ascending("message"),
          sources: [...state.selected],
          uploads: [],
        })
        remember()
      }
      const attempt = state.attempt!
      const owned = await dockapi.sessions.get(attempt.binding.id)
      if (!current()) return
      if (
        owned.agentType !== "mstock" ||
        owned.directoryPath !== sdk().directory ||
        owned.openCodeSessionId !== attempt.binding.openCodeSessionId
      )
        throw new Error("恢复的会话不属于当前多股对比任务")
      await sync().session.sync(attempt.binding.openCodeSessionId, { force: true })
      if (!current()) return
      if (sync().data.message[attempt.binding.openCodeSessionId]?.some((message) => message.id === attempt.messageID)) {
        open(attempt.binding)
        return
      }
      const sources = await dockapi.mstock.prepare(attempt.binding.id, [...state.selected])
      if (!current()) return
      const references = sources.map((source) => ({
        path: source.path,
        title: source.title,
        mime: "text/plain",
        url: undefined as string | undefined,
      }))
      for (const upload of state.uploads) {
        const path =
          upload.path ??
          `${attempt.directory.replaceAll("\\", "/")}/inputs/uploads/${upload.id}-${safeUploadedFilename(upload.name)}`
        const relative = cmccWorkspaceRelativePath(sdk().directory, path)
        if (!relative) throw new Error("上传文件路径不属于当前用户工作区")
        if (!upload.path) {
          if (!upload.file) throw new Error(`请重新选择未完成上传的文件：${upload.name}`)
          await sdk().client.file.upload(
            { path: relative, content: await fileBase64(upload.file), encoding: "base64" },
            { throwOnError: true },
          )
          if (!current()) return
          setState("uploads", (item) => item.id === upload.id, "path", path)
          remember()
        }
        if (isWordDocument(new File([], upload.name), upload.mime)) {
          const original =
            upload.file ??
            new File([(await sdk().client.file.download({ path: relative })).data as Blob], upload.name, {
              type: upload.mime,
            })
          const content = await wordAttachmentText(original, upload.mime, path)
          references.push({
            path,
            title: upload.name,
            mime: "text/plain",
            url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
          })
        } else references.push({ path, title: upload.name, mime: upload.mime, url: undefined })
      }
      if (!current()) return
      const result = await sendFollowupDraft({
        client: sdk().client,
        serverSync: serverSync(),
        sync: sync(),
        messageID: attempt.messageID,
        optimisticBusy: true,
        draft: {
          sessionID: attempt.binding.openCodeSessionId,
          sessionDirectory: sdk().directory,
          prompt: mstockPrompt(references),
          context: [],
          agent: "build",
          model: { modelID: model.id, providerID: model.provider.id },
          variant: local.model.variant.current(),
          system: cmccArtifactSystemPrompt(sdk().directory, attempt.directory),
        },
      })
      if (result && current()) open(attempt.binding)
    } catch (error) {
      if (current()) {
        setState("error", error instanceof Error ? error.message : String(error))
        remember()
      }
    } finally {
      if (current()) setState("busy", false)
    }
  }
  return (
    <main class="mstock-form" classList={{ "mstock-nav-clearance": !layout.sidebar.opened() }}>
      <CmccPageBackground />
      <header class="mstock-heading">
        <h1>DeepTrading财经分析专家团</h1>
        <div class="mstock-heading-nav">
          <span>对比中心</span>
          <button aria-label="返回产业洞察" title="返回产业洞察" onClick={() => navigate("/expert")}>
            <Icon name="arrow-right" />
          </button>
        </div>
      </header>
      <div class="mstock-scroll">
        <div class="mstock-body">
          <section class="mstock-hero">
            <div class="mstock-hero-copy">
              <h2>
                <strong>多股投研</strong>
                <span>对比分析中心</span>
              </h2>
              <p>基本面 · 估值 · 技术面 · 舆情 · 风险</p>
            </div>
            <div class="mstock-steps" aria-label="对比流程">
              <For each={["勾选对比个股", "上传研报/文档", "配置对比维度"]}>
                {(label, index) => (
                  <>
                    <Show when={index() > 0}>
                      <span class="mstock-workflow-line" classList={{ dashed: index() === 2 }} aria-hidden="true" />
                    </Show>
                    <div class="mstock-workflow-step">
                      <img src={`/mstock/workflow-${index() + 1}.png`} alt="" />
                      <div class="mstock-workflow-label">
                        <strong>{label}</strong>
                        <span
                          class="mstock-step-status"
                          classList={{
                            completed:
                              (index() === 0
                                ? state.selected.length
                                : index() === 1
                                  ? state.uploads.length
                                  : state.dimensions.length) > 0,
                          }}
                          aria-hidden="true"
                        >
                          <Icon name="check" />
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </For>
            </div>
          </section>
          <section class="mstock-section mstock-source-section">
            <header>
              <img src="/mstock/workflow-1.png" alt="" />
              <h3>
                <em>第一步：</em>勾选对比个股
              </h3>
              <button
                title="刷新报告"
                aria-label="刷新报告"
                disabled={state.loading || state.busy}
                onClick={() => void load()}
              >
                <Icon name="arrow-undo-down" />
              </button>
            </header>
            <div class="mstock-section-content">
              <div class="mstock-sources">
                <For
                  each={state.sources}
                  fallback={
                    <p class="mstock-empty">
                      {state.loading ? "正在读取历史报告…" : "暂无已完成且可用于对比的财经报告"}
                    </p>
                  }
                >
                  {(source) => (
                    <label class="mstock-source">
                      <img class="mstock-source-kind" src={sourceStockIcon} alt="" />
                      <span class="mstock-source-info">
                        <strong>
                          {source.companyName || source.title}
                          {source.ticker ? ` · ${source.ticker}` : ""}
                        </strong>
                        <small>{source.createdAt?.slice(0, 10)}</small>
                      </span>
                      <small class="mstock-ready">研报准备就绪</small>
                      <input
                        type="checkbox"
                        disabled={state.busy || !!state.attempt}
                        checked={state.selected.includes(source.businessSessionId)}
                        onChange={(event) =>
                          setState("selected", (ids) =>
                            event.currentTarget.checked
                              ? [...ids, source.businessSessionId]
                              : ids.filter((id) => id !== source.businessSessionId),
                          )
                        }
                      />
                    </label>
                  )}
                </For>
              </div>
              <Show when={state.sourceError}>
                <p role="alert" class="mstock-error">
                  {state.sourceError}
                </p>
              </Show>
              <Show when={state.nextPage !== null}>
                <button class="mstock-more" disabled={state.loading} onClick={() => void load(state.nextPage!)}>
                  {state.loading ? "加载中…" : "查看更多报告"}
                </button>
              </Show>
            </div>
          </section>
          <section class="mstock-section mstock-upload-section">
            <header>
              <img src="/mstock/workflow-2.png" alt="" />
              <h3>
                <em>第二步：</em>上传外部公司研报 / 自定义文档
              </h3>
            </header>
            <div class="mstock-section-content">
              <input
                ref={input}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES.join(",")}
                class="hidden"
                onChange={(event) => {
                  void append(Array.from(event.currentTarget.files ?? []))
                  event.currentTarget.value = ""
                }}
              />
              <button
                class="mstock-upload"
                data-dragging={state.dragging}
                disabled={state.busy || (!!state.attempt && !state.uploads.some((item) => !item.file && !item.path))}
                onClick={() => input?.click()}
                onDragOver={(event) => {
                  event.preventDefault()
                  setState("dragging", true)
                }}
                onDragLeave={() => setState("dragging", false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setState("dragging", false)
                  void append(Array.from(event.dataTransfer?.files ?? []))
                }}
              >
                <img src={uploadCloudIcon} alt="" />
                <span>上传研报 / 文档</span>
              </button>
              <Show when={state.uploads.length > 0}>
                <div class="mstock-uploaded-files">
                  <For each={state.uploads}>
                    {(file) => (
                      <div class="mstock-uploaded">
                        <Icon name="file-tree" />
                        <span>
                          <strong title={file.name}>{file.name}</strong>
                          <small>{Math.ceil(file.size / 1024)} KB</small>
                        </span>
                        <button
                          title="移除文件"
                          aria-label={`移除 ${file.name}`}
                          disabled={state.busy || !!state.attempt}
                          onClick={() => setState("uploads", (items) => items.filter((item) => item.id !== file.id))}
                        >
                          <Icon name="close" />
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </section>
          <section class="mstock-section mstock-dimensions-section">
            <header>
              <img src="/mstock/workflow-3.png" alt="" />
              <h3>
                <em>第三步：</em>配置对比侧重维度
              </h3>
            </header>
            <div class="mstock-section-content">
              <div class="mstock-dimensions">
                <For each={MSTOCK_DIMENSIONS}>
                  {(dimension) => (
                    <label classList={{ selected: state.dimensions.includes(dimension) }}>
                      <input
                        type="checkbox"
                        checked={state.dimensions.includes(dimension)}
                        onChange={(event) =>
                          setState("dimensions", (selected) =>
                            event.currentTarget.checked
                              ? [...selected, dimension]
                              : selected.filter((value) => value !== dimension),
                          )
                        }
                      />
                      <span class="mstock-dimension-check" aria-hidden="true">
                        <Icon name="check" />
                      </span>
                      <span>{dimension}</span>
                    </label>
                  )}
                </For>
              </div>
              <Show when={state.error}>
                <p role="alert" class="mstock-error">
                  {state.error}
                </p>
              </Show>
              <div class="mstock-launch">
                <span>
                  {state.selected.length + state.uploads.length} 份输入资料 · {state.dimensions.length} 个对比维度
                </span>
                <button
                  class="mstock-start"
                  disabled={state.busy || state.selected.length + state.uploads.length < 2}
                  onClick={() => void start()}
                >
                  <Icon name="arrow-up" />
                  {state.busy ? "正在准备对比…" : "开始多股票综合对比"}
                </button>
                <div class="mstock-launch-options">
                  <button
                    class="mstock-model"
                    disabled={state.busy}
                    onClick={() => dialog.show(() => <DialogSelectModel />)}
                  >
                    <span>{local.model.current()?.name ?? "选择模型"}</span>
                    <Icon name="chevron-down" />
                  </button>
                  <Show when={state.attempt}>
                    <button disabled={state.busy} onClick={clearAttempt}>
                      重新选择
                    </button>
                  </Show>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
