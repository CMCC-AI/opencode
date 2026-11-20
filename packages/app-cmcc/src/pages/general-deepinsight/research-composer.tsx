import { For, Show, Suspense, createEffect, onCleanup, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useSearchParams } from "@solidjs/router"
import { useQueryClient } from "@tanstack/solid-query"
import { PromptInput, type PromptInputProps } from "@/components/prompt-input"
import { PromptSendButton } from "@/components/prompt-input/send-button"
import { HomeActionsPopover } from "@/components/prompt-input/home-controls"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { PromptImageAttachments } from "@/components/prompt-input/image-attachments"
import { NewSessionComposerLoading, NewSessionDesignView } from "@/components/session/session-new-design-view"
import { useSettingsCommand } from "@/components/settings-dialog"
import { ModelsProvider, type ModelKey } from "@/context/models"
import { PermissionProvider } from "@/context/permission"
import { FileProvider } from "@/context/file"
import { CommentsProvider, useComments } from "@/context/comments"
import { DirectoryDataProvider } from "@/pages/directory-layout"
import { createAttachmentStorage } from "@/components/prompt-input/upload-storage"
import { usePrompt } from "@/context/prompt"
import { useDockApi } from "@/context/dockapi"
import { useSDK } from "@/context/sdk"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { createPromptInputController } from "@/pages/session/composer"
import { useSessionKey } from "@/pages/session/session-layout"
import { useComposerCommands } from "@/pages/session/use-composer-commands"
import { CMCC_DEFAULT_RESEARCH_EXPERT, CMCC_TEAM_EXPERTS, cmccTeamExpertByAgent, type TeamExpert } from "@/utils/cmcc-experts"
import { cmccEnsureWorkspace } from "@/utils/cmcc-workspace"
import { cmccWorkspaceRelativePath } from "@/utils/cmcc-artifact-paths"
import { pathKey } from "@/utils/path-key"
import { showToast } from "@/utils/toast"
import { createResearchAttachments, RESEARCH_FILE_ACCEPT, type ResearchMode } from "./research-attachments"
import { RESEARCH_API, RESEARCH_UPDATED, type ResearchDetail } from "./model"

export default function ResearchComposer() {
  const prompt = usePrompt()
  const dockapi = useDockApi()
  const tabs = useTabs()
  const sdk = useSDK()
  const sync = useServerSync()
  const queryClient = useQueryClient()
  const [search, setSearch] = useSearchParams<{ draftId?: string; prompt?: string; agent?: string }>()
  const draftID = search.draftId!
  const draft = tabs.draft(draftID)
  const userID = dockapi.user?.id
  const scope = sdk().scope
  const directory = sdk().directory
  const expert = () => CMCC_TEAM_EXPERTS.find((item) => item.id === draft.expertID)
  const [state, setState] = createStore({
    mode: draft.researchMode ?? "deep",
    submitting: false,
    switching: false,
    uploading: false,
    editorUploading: false,
    menu: false,
  })
  let selectedModel: ModelKey | undefined
  let alive = true
  let editor: HTMLDivElement | undefined
  let menu: HTMLDivElement | undefined
  createEffect(() => {
    if (!state.menu) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return
      if (
        event instanceof PointerEvent &&
        event.target instanceof Element &&
        (menu?.contains(event.target) || event.target.closest('[data-action="prompt-cmcc-actions"]'))
      )
        return
      setState("menu", false)
    }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", close)
    onCleanup(() => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", close)
    })
  })
  onCleanup(() => {
    alive = false
  })
  const valid = () =>
    alive &&
    dockapi.user?.id === userID &&
    sdk().scope === scope &&
    sdk().directory === directory &&
    search.draftId === draftID
  const request = <T,>(path: string, init?: RequestInit) => dockapi.research.request<T>(`${RESEARCH_API}${path}`, init)
  const storage = createAttachmentStorage({
    workspace: directory,
    directory: draft.artifactDirectory,
    prepare: () =>
      cmccEnsureWorkspace(
        draft.artifactDirectory,
        (path) => sdk().client.file.createDirectory({ path }, { throwOnError: true }),
        scope,
      ),
    upload: (path, content) => sdk().client.file.upload({ path, content, encoding: "base64" }, { throwOnError: true }),
    remove: (path) => sdk().client.file.remove({ path, recursive: true }, { throwOnError: true }),
  })
  const attachments = createResearchAttachments({
    prompt,
    mode: () => state.mode,
    valid,
    request,
    storage: () => storage,
    existingOpenCode: (item) => {
      if (item.mime.startsWith("image/") && item.dataUrl.startsWith(`data:${item.mime};`)) return true
      if (!item.referenceUrl || !item.sourcePath) return false
      const notebook = draft.knowledgeNotebook
      if (notebook) return !!cmccWorkspaceRelativePath(notebook.directory, item.sourcePath)?.startsWith(`runs/${draftID}/attachments/`)
      return !!draft.artifactDirectory &&
        !!cmccWorkspaceRelativePath(draft.artifactDirectory, item.sourcePath)?.startsWith("attachments/")
    },
    removeDeep: async (path) => {
      const relative = cmccWorkspaceRelativePath(directory, path)
      const prefix = cmccWorkspaceRelativePath(directory, draft.artifactDirectory ?? "")
      if (!relative || !prefix || !relative.startsWith(`${prefix}/attachments/`)) throw new Error("附件不属于当前草稿")
      return sdk().client.file.remove({ path: relative }, { throwOnError: true })
    },
  })
  const error = (cause: unknown) => {
    if (valid())
      showToast({
        variant: "error",
        title: "研究操作失败",
        description: cause instanceof Error ? cause.message : String(cause),
      })
  }
  const pending = () => state.submitting || state.switching || state.uploading || attachments.state.pending
  const busy = () => pending() || state.editorUploading
  const changeMode = async (mode: ResearchMode) => {
    if (busy() || mode === state.mode) return
    setState({ mode, switching: true, menu: false })
    tabs.updateDraft(draftID, { researchMode: mode })
    try {
      await attachments.prepareAll()
    } catch (cause) {
      error(cause)
    } finally {
      if (valid()) setState("switching", false)
    }
  }
  const selectTeam = async (team?: TeamExpert, agent = team?.leadAgent) => {
    if (!valid() || busy() || (team?.id === expert()?.id && agent === draft.agent)) return
    if (draft.knowledgeNotebook) {
      showToast({ title: "请先移除知识库引用，再切换专家团", variant: "error" })
      return
    }
    setState({ switching: true, menu: false })
    try {
      if (team) {
        const agents = await queryClient.ensureQueryData(sync().queryOptions.agents(pathKey(directory)))
        if (!agents.some((item) => item.name === team.leadAgent)) throw new Error(`未加载「${team.name}」的专家团配置`)
        if (agent && agent !== team.leadAgent && !agents.some((item) => item.name === agent))
          throw new Error(`未加载「${team.name}」的快速通道配置`)
      }
      if (!valid()) return
      const researchMode = team?.id === CMCC_DEFAULT_RESEARCH_EXPERT.id ? "deep" : undefined
      setState("mode", "deep")
      tabs.updateDraft(draftID, { homeTeamPicker: true, expertID: team?.id, agent, researchMode })
      await attachments.prepareAll()
    } catch (cause) {
      error(cause)
    } finally {
      if (valid()) setState("switching", false)
    }
  }
  createEffect(() => {
    if (!prompt.ready()) return
    untrack(() => {
      const text = search.prompt
      if (text) prompt.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
      if (text || search.agent) setSearch({ prompt: undefined, agent: undefined }, { replace: true })
      requestAnimationFrame(() => {
        if (valid()) editor?.focus()
      })
    })
  })
  const submit = async (deepSubmit: () => Promise<void> | void) => {
    if (busy() || !valid()) return
    setState("submitting", true)
    try {
      const query = prompt
        .current()
        .map((part) => ("content" in part ? part.content : ""))
        .join("")
        .trim()
      if (draft.researchMode && !query) throw new Error("请输入研究问题")
      if (state.mode === "quick" && query.length > 20000) throw new Error("快速研究问题不能超过 20000 个字符")
      if (!(await attachments.prepareAll()) || !valid()) return
      if (state.mode !== "quick") {
        await deepSubmit()
        return
      }
      await dockapi.quota.checkResearch()
      if (!valid()) return
      const uploadId = attachments.uploadId()
      const session = await request<ResearchDetail["session"]>("/sessions", {
        method: "POST",
        body: JSON.stringify({ query, ...(uploadId ? { uploadId } : {}) }),
      })
      if (!valid()) return
      window.dispatchEvent(new Event(RESEARCH_UPDATED))
      tabs.finishResearchDraft(draftID, session.id)
    } catch (cause) {
      error(cause)
    } finally {
      if (valid()) setState("submitting", false)
    }
  }
  let picker!: HTMLInputElement
  const query = () =>
    prompt
      .current()
      .map((part) => ("content" in part ? part.content : ""))
      .join("")
  const setQuery = (text: string) =>
    prompt.set([{ type: "text", content: text, start: 0, end: text.length }, ...attachments.items()], text.length)
  const upload = async (files: File[]) => {
    if (pending()) return
    setState("uploading", true)
    try {
      for (const file of files) {
        const item = await attachments.read(file)
        if (!valid()) return
        prompt.set([...prompt.current().filter((part) => part.type !== "image" || part.id !== item.id), item])
      }
    } catch (cause) {
      error(cause)
    } finally {
      if (valid()) setState("uploading", false)
    }
  }
  const research: NonNullable<PromptInputProps["research"]> = {
    get mode() {
      return draft.researchMode
    },
    get pending() {
      return pending()
    },
    get blocked() {
      return attachments.issues().length > 0
    },
    changeMode: (mode) => void changeMode(mode),
    readAttachment: attachments.read,
    onUploadPending: (value) => setState("editorUploading", value),
    removeAttachment: (id) => {
      if (!busy()) void attachments.remove(id).catch(error)
    },
    submit,
  }
  return (
    <NewSessionDesignView team={expert()} onTeamChange={(team) => void selectTeam(team)} teamDisabled={busy() || !prompt.ready()}>
    <Show when={prompt.ready()} fallback={<NewSessionComposerLoading />}>
      <div class="flex flex-col gap-3" data-research-home>
        <Show
          when={state.mode === "deep"}
          fallback={
            <form
              data-component="session-new-composer"
              class="cmcc-home-composer-surface w-full"
              onSubmit={(event) => {
                event.preventDefault()
                void submit(() => {})
              }}
            >
              <PromptImageAttachments
                attachments={attachments.items()}
                onOpen={() => {}}
                onRemove={research.removeAttachment}
                removeLabel="移除附件"
              />
              <div>
                <textarea
                  data-component="prompt-input"
                  aria-label="请告诉您要研究的问题？"
                  placeholder="请告诉您要研究的问题？"
                  class="block min-h-[112px] max-h-[180px] w-full resize-y border-0 bg-transparent px-4 pt-4 pb-2 font-[440] outline-none"
                  value={query()}
                  disabled={pending()}
                  onInput={(event) => setQuery(event.currentTarget.value)}
                  onPaste={(event) => {
                    if (event.clipboardData?.files.length) {
                      event.preventDefault()
                      void upload(Array.from(event.clipboardData.files))
                    }
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (event.dataTransfer) void upload(Array.from(event.dataTransfer.files))
                  }}
                />
              </div>
              <div class="home-composer-toolbar flex h-11 items-center gap-1 px-2">
                <input
                  ref={picker}
                  type="file"
                  class="hidden"
                  multiple
                  accept={RESEARCH_FILE_ACCEPT}
                  onChange={(event) => {
                    void upload(Array.from(event.currentTarget.files ?? []))
                    event.currentTarget.value = ""
                  }}
                />
                <HomeActionsPopover
                  ref={(element) => {
                    menu = element
                  }}
                  open={state.menu}
                  menu
                  content={
                    <div data-component="cmcc-prompt-action-menu">
                      <button
                        type="button"
                        class="flex w-full items-center gap-2 px-3 text-left"
                        onClick={() => {
                          setState("menu", false)
                          picker.click()
                        }}
                      >
                        <Icon name="link" />
                        上传文档
                      </button>
                    </div>
                  }
                >
                  <IconButton
                    type="button"
                    data-action="prompt-cmcc-actions"
                    aria-label="打开更多操作"
                    icon="plus"
                    variant="ghost"
                    disabled={pending()}
                    onClick={() => setState("menu", !state.menu)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setState("menu", false)
                    }}
                  />
                </HomeActionsPopover>
                <div class="flex-1" />
                <div class="home-agent-control" role="group" aria-label="研究模式">
                  <For each={["quick", "deep"] as const}>
                    {(mode) => (
                      <button
                        type="button"
                        aria-pressed={state.mode === mode}
                        disabled={pending()}
                        onClick={() => void changeMode(mode)}
                      >
                        {mode === "quick" ? "快速" : "深度"}
                      </button>
                    )}
                  </For>
                </div>
                <PromptSendButton
                  type="submit"
                  mode="send"
                  aria-label="发送"
                  disabled={pending() || research.blocked || !query().trim()}
                />
              </div>
            </form>
          }
        >
          <Suspense
            fallback={
              <div>
                <NewSessionComposerLoading />
                <button type="button" class="mt-2 text-[13px] text-[#5269ef]" onClick={() => void changeMode("quick")}>
                  切换快速研究
                </button>
              </div>
            }
          >
            <DeepResearchInput
              research={research}
              agent={draft.agent}
              onAgentChange={(agent) => void selectTeam(cmccTeamExpertByAgent(agent), agent)}
              model={() => selectedModel}
              remember={(model) => {
                selectedModel = model
              }}
              ref={(element) => {
                editor = element
              }}
            />
          </Suspense>
        </Show>
        <Show when={attachments.issues().length}>
          <div role="alert" class="text-[13px] leading-5 text-red-600">
            <For each={attachments.issues()}>{(issue) => <p>{issue}</p>}</For>
            <button
              type="button"
              disabled={pending()}
              onClick={() => void attachments.prepareAll().catch(error)}
              class="mt-1 underline"
            >
              重试上传
            </button>
          </div>
        </Show>
      </div>
    </Show>
    </NewSessionDesignView>
  )
}

function DeepResearchInput(props: {
  research: NonNullable<PromptInputProps["research"]>
  agent?: string
  onAgentChange: (agent?: string) => void
  model: () => ModelKey | undefined
  remember: (model: ModelKey | undefined) => void
  ref: (element: HTMLDivElement) => void
}) {
  const sdk = useSDK()
  const [search] = useSearchParams<{ draftId?: string }>()
  const directory = () => sdk().directory
  return (
    <PermissionProvider directory={directory}>
      <ModelsProvider directory={directory}>
        <DirectoryDataProvider directory={directory} draftID={search.draftId}>
          <FileProvider>
            <CommentsProvider>
              <DeepResearchEditor {...props} />
            </CommentsProvider>
          </FileProvider>
        </DirectoryDataProvider>
      </ModelsProvider>
    </PermissionProvider>
  )
}

function DeepResearchEditor(props: Parameters<typeof DeepResearchInput>[0]) {
  const sync = useServerSync()
  const comments = useComments()
  useComposerCommands()
  useSettingsCommand()
  const route = useSessionKey()
  const controls = createPromptInputController({
    sessionKey: route.sessionKey,
    sessionID: () => undefined,
    queryOptions: sync().queryOptions,
  })
  let restored = false
  createEffect(() => {
    if (restored || controls().model.loading) return
    restored = true
    const model = props.model()
    if (model) controls().model.selection.set(model)
  })
  onCleanup(() => {
    const model = controls().model.selection.current()
    if (model) props.remember({ modelID: model.id, providerID: model.provider.id })
  })
  return (
    <PromptInput
      controls={controls()}
      variant="new-session"
      selectedExpertAgent={props.agent}
      onSelectedExpertAgentChange={props.onAgentChange}
      onSubmit={() => comments.clear()}
      research={props.research}
      ref={props.ref}
    />
  )
}
