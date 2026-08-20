import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { Tabs } from "@opencode-ai/ui/tabs"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import type { FileContent, Part, SnapshotFileDiff, Todo, VcsFileDiff } from "@opencode-ai/sdk/v2"
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd"
import { useDialog } from "@opencode-ai/ui/context/dialog"

import FileTree from "@/components/file-tree"
import { ArtifactPreview } from "@/components/artifact-preview"
import { SessionContextUsage } from "@/components/session-context-usage"
import { SessionContextTab, SortableTab, FileVisual } from "@/components/session"
import { useCommand } from "@/context/command"
import { useFile, type SelectedLineRange } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useSettings } from "@/context/settings"
import { useSDK } from "@/context/sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { createFileTabListSync } from "@/pages/session/file-tab-scroll"
import { FileTabContent } from "@/pages/session/file-tabs"
import {
  createOpenSessionFileTab,
  createSessionTabs,
  getTabReorderIndex,
  shouldShowFileTree,
  type Sizing,
} from "@/pages/session/helpers"
import { setSessionHandoff } from "@/pages/session/handoff"
import { useSessionLayout } from "@/pages/session/session-layout"
import { DeepInsightMark } from "@/components/brand"
import { showToast } from "@/utils/toast"
import { artifactPreviewKind, artifactText, resolveArtifactPath } from "@/pages/session/artifact-preview"
import { cmccArtifactDirectory } from "@/utils/cmcc-workspace"
import {
  cmccScanWorkspaceArtifactPaths,
  cmccScopedArtifactPath,
  cmccWorkspaceRelativePath,
} from "@/utils/cmcc-artifact-paths"

type RenderDiff = (SnapshotFileDiff & { file: string }) | VcsFileDiff
type CmccPanelTab = "plan" | "artifacts" | "browser" | "review"
type CmccArtifact = {
  id: string
  path: string
  source: string
  status: "created" | "changed" | "deleted"
}

const [retainedTodos, setRetainedTodos] = createStore({
  bySession: {} as Record<string, Todo[] | undefined>,
})

function renderDiff(value: SnapshotFileDiff | VcsFileDiff): value is RenderDiff {
  return typeof value.file === "string"
}

function stringInput(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function toolPath(part: Part) {
  if (part.type !== "tool") return
  const input = part.state.input
  return (
    stringInput(input.filePath) ??
    stringInput(input.file) ??
    stringInput(input.path) ??
    stringInput(input.target) ??
    stringInput(input.filename)
  )
}

function artifactStatus(value: RenderDiff["status"]): CmccArtifact["status"] {
  if (value === "added") return "created"
  if (value === "deleted") return "deleted"
  return "changed"
}

function todoStatusLabel(value: Todo["status"]) {
  if (value === "completed") return "完成"
  if (value === "in_progress") return "进行中"
  if (value === "cancelled") return "取消"
  return "待处理"
}

function normalizePathSeparators(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "")
}

function fileName(value: string) {
  return normalizePathSeparators(value).split("/").filter(Boolean).at(-1) ?? value
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function markdownArtifactElement(target: EventTarget | null) {
  if (!(target instanceof Element)) return undefined
  const element = target.closest<HTMLElement>("a") ?? target.closest<HTMLElement>("code")
  if (!element?.closest('[data-component="markdown"]')) return undefined
  return element
}

function markdownArtifactCandidate(element: HTMLElement) {
  if (element instanceof HTMLAnchorElement) return element.getAttribute("href") ?? element.textContent ?? ""
  return element.textContent ?? ""
}

export function SessionSidePanel(props: {
  canReview: () => boolean
  diffs: () => (SnapshotFileDiff | VcsFileDiff)[]
  diffsReady: () => boolean
  empty: () => string
  hasReview: () => boolean
  reviewCount: () => number
  reviewPanel: () => JSX.Element
  activeDiff?: string
  focusReviewDiff: (path: string) => void
  reviewSnap: boolean
  size: Sizing
  open?: () => boolean
  width?: () => string
  plain?: boolean
}) {
  const layout = useLayout()
  const settings = useSettings()
  const serverSync = useServerSync()
  const sync = useSync()
  const file = useFile()
  const sdk = useSDK()
  const language = useLanguage()
  const command = useCommand()
  const dialog = useDialog()
  const { sessionKey, tabs, view, params } = useSessionLayout()

  const isDesktop = createMediaQuery("(min-width: 768px)")
  const shown = settings.visibility.fileTree

  const reviewOpen = createMemo(() => isDesktop() && (props.open?.() ?? view().reviewPanel.opened()))
  const fileOpen = createMemo(
    () =>
      isDesktop() &&
      shouldShowFileTree({
        visible: shown(),
        opened: layout.fileTree.opened(),
      }),
  )
  const open = createMemo(() => props.open?.() ?? (reviewOpen() || fileOpen()))
  const reviewTab = createMemo(() => isDesktop())
  const panelWidth = createMemo(() => {
    const width = props.width?.()
    if (width) return width
    if (!open()) return "0px"
    if (reviewOpen()) return "auto"
    return `${layout.fileTree.width()}px`
  })
  const treeWidth = createMemo(() => (fileOpen() ? `${layout.fileTree.width()}px` : "0px"))
  const [cmcc, setCmcc] = createStore({
    activeTab: "plan" as CmccPanelTab,
    activeArtifact: undefined as string | undefined,
    openArtifacts: [] as string[],
    browser: {
      draft: "",
      url: "",
      document: undefined as string | undefined,
      title: "浏览器",
      history: [] as string[],
      historyIndex: -1,
      revision: 0,
    },
    workspaceArtifactPaths: [] as string[],
  })

  const sessionInfo = createMemo(() => {
    const sessionID = params.id
    if (!sessionID) return
    return serverSync().session.get(sessionID)
  })
  const artifactRoot = createMemo(() => {
    const directory = sdk().directory
    const artifact = cmccArtifactDirectory(sessionInfo()?.metadata, directory)
    if (!artifact) return
    return cmccWorkspaceRelativePath(directory, artifact)
  })
  const scopedArtifactPath = (value: string) => {
    if (params.id && !sessionInfo()) return
    return cmccScopedArtifactPath(sdk().directory, artifactRoot(), value)
  }
  const diffs = createMemo(() =>
    props
      .diffs()
      .filter(renderDiff)
      .flatMap((diff) => {
        const file = scopedArtifactPath(diff.file)
        return file ? [{ ...diff, file }] : []
      }),
  )
  const diffFiles = createMemo(() => diffs().map((d) => d.file))
  const liveTodos = createMemo(() => {
    if (!params.id) return []
    return serverSync().session.data.todo[params.id] ?? []
  })
  createEffect(() => {
    const id = params.id
    const current = liveTodos()
    if (!id || current.length === 0) return
    setRetainedTodos("bySession", id, current)
  })
  const todos = createMemo(() => {
    if (!params.id) return []
    const current = liveTodos()
    if (current.length > 0) return current
    return retainedTodos.bySession[params.id] ?? []
  })
  const messages = createMemo(() => {
    if (!params.id) return []
    return sync().data.message[params.id] ?? []
  })
  const parts = createMemo(() => messages().flatMap((message) => sync().data.part[message.id] ?? []))
  const artifactRoots = createMemo(() => {
    const root = artifactRoot()
    if (root) return [root]
    return messages().flatMap((message) => {
      if (message.role !== "assistant") return []
      const relative = cmccWorkspaceRelativePath(sdk().directory, message.path.cwd)
      return relative ? [relative] : []
    })
  })
  const artifactRefreshKey = createMemo(() =>
    parts()
      .flatMap((part) => {
        if (part.type === "patch") return [part.id]
        if (part.type === "tool" && (part.state.status === "completed" || part.state.status === "error"))
          return [part.id]
        return []
      })
      .join(":"),
  )
  const artifacts = createMemo(() => {
    const items = new Map<string, CmccArtifact>()

    for (const diff of diffs()) {
      items.set(diff.file, {
        id: `diff:${diff.file}`,
        path: diff.file,
        source: "审查变更",
        status: artifactStatus(diff.status),
      })
    }

    for (const part of parts()) {
      if (part.type === "patch") {
        for (const value of part.files) {
          const path = scopedArtifactPath(value)
          if (!path) continue
          items.set(path, {
            id: `${part.id}:${path}`,
            path,
            source: "补丁产出",
            status: "changed",
          })
        }
      }
      if (part.type === "tool" && ["write", "edit", "apply_patch"].includes(part.tool)) {
        const value = toolPath(part)
        const path = value ? scopedArtifactPath(value) : undefined
        if (!path) continue
        items.set(path, {
          id: `${part.id}:${path}`,
          path,
          source: part.tool === "write" ? "文件写入" : "文件编辑",
          status: part.tool === "write" ? "created" : "changed",
        })
      }
    }

    for (const path of cmcc.workspaceArtifactPaths) {
      if (items.has(path)) continue
      items.set(path, {
        id: `workspace:${path}`,
        path,
        source: "工作目录产出",
        status: "created",
      })
    }

    return [...items.values()]
  })
  const artifactPaths = createMemo(() => artifacts().map((item) => item.path))

  createEffect(() => {
    const directory = sdk().directory
    const sessionID = params.id
    const roots = artifactRoots()
    artifactRefreshKey()
    if (!sessionID || !sessionInfo()) {
      setCmcc("workspaceArtifactPaths", [])
      return
    }

    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    const list = (path: string) =>
      sdk()
        .client.file.list({ path })
        .then(
          (result) => result.data ?? [],
          () => [],
        )

    void cmccScanWorkspaceArtifactPaths(list, roots, artifactRoot() !== undefined).then((paths) => {
      if (cancelled) return
      if (sdk().directory !== directory || params.id !== sessionID) return
      setCmcc("workspaceArtifactPaths", paths)
    })
  })
  const kinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }

    const normalize = (p: string) => p.replaceAll("\\\\", "/").replace(/\/+$/, "")

    const out = new Map<string, "add" | "del" | "mix">()
    for (const diff of diffs()) {
      const file = normalize(diff.file)
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix"

      out.set(file, kind)

      const parts = file.split("/")
      for (const [idx] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, idx + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }
    return out
  })

  const empty = (msg: string) => (
    <div class="h-full flex flex-col">
      <div class="h-6 shrink-0" aria-hidden />
      <div class="flex-1 pb-64 flex items-center justify-center text-center">
        <div class="text-12-regular text-text-weak">{msg}</div>
      </div>
    </div>
  )

  const nofiles = createMemo(() => {
    const root = artifactRoot() ?? ""
    const state = file.tree.state(root)
    if (!state?.loaded) return false
    return file.tree.children(root).length === 0
  })

  const normalizeTab = (tab: string) => {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }

  const openReviewPanel = () => {
    if (!view().reviewPanel.opened()) view().reviewPanel.open()
  }

  const openTab = createOpenSessionFileTab({
    normalizeTab,
    openTab: tabs().open,
    pathFromTab: file.pathFromTab,
    loadFile: file.load,
    openReviewPanel,
    setActive: tabs().setActive,
  })

  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab,
    review: reviewTab,
    hasReview: props.canReview,
  })
  const contextOpen = tabState.contextOpen
  const openedTabs = tabState.openedTabs
  const activeTab = tabState.activeTab
  const activeFileTab = tabState.activeFileTab

  const fileTreeTab = () => layout.fileTree.tab()

  const setFileTreeTabValue = (value: string) => {
    if (value !== "changes" && value !== "all") return
    layout.fileTree.setTab(value)
  }

  const showAllFiles = () => {
    if (fileTreeTab() !== "changes") return
    layout.fileTree.setTab("all")
  }

  const openArtifact = (path: string) => {
    openReviewPanel()
    setCmcc("openArtifacts", (current) => (current.includes(path) ? current : [...current, path]))
    setCmcc("activeArtifact", path)
    if (artifactPreviewKind(path) === "html") {
      setCmcc("activeTab", "browser")
      setCmcc("browser", {
        draft: path,
        url: "about:blank",
        document: undefined,
        title: fileName(path),
        history: [],
        historyIndex: -1,
        revision: cmcc.browser.revision + 1,
      })
      void file.load(path).then(() => {
        if (cmcc.activeArtifact !== path) return
        const content = file.get(path)?.content
        if (!content) return
        setCmcc("browser", "document", artifactText(content.content, content.encoding))
      })
      return
    }

    setCmcc("activeTab", "artifacts")
    void file.load(path)
    openTab(file.tab(path))
  }

  const closeArtifact = (path: string) => {
    const index = cmcc.openArtifacts.indexOf(path)
    const next = cmcc.openArtifacts[index + 1] ?? cmcc.openArtifacts[index - 1]
    setCmcc("openArtifacts", (current) => current.filter((item) => item !== path))
    if (cmcc.activeArtifact !== path) return
    if (next) {
      openArtifact(next)
      return
    }
    setCmcc("activeArtifact", undefined)
    setCmcc("activeTab", "artifacts")
  }

  const activateMarkdownArtifact = (target: EventTarget | null) => {
    const element = markdownArtifactElement(target)
    if (!element) return false
    const path =
      element.dataset.cmccArtifactPath ?? resolveArtifactPath(markdownArtifactCandidate(element), artifactPaths())
    if (!path) return false
    openArtifact(path)
    return true
  }

  createEffect(() => {
    const paths = artifactPaths()
    queueMicrotask(() => {
      document.querySelectorAll<HTMLElement>('[data-component="markdown"] :is(a, code)').forEach((element) => {
        const path = resolveArtifactPath(markdownArtifactCandidate(element), paths)
        if (!path) {
          delete element.dataset.cmccArtifactPath
          if (element.dataset.cmccArtifactInteractive === "true") {
            delete element.dataset.cmccArtifactInteractive
            element.removeAttribute("role")
            element.removeAttribute("tabindex")
            element.removeAttribute("title")
          }
          return
        }

        element.dataset.cmccArtifactPath = path
        element.title = "在右侧预览"
        if (element instanceof HTMLAnchorElement) return
        element.dataset.cmccArtifactInteractive = "true"
        element.setAttribute("role", "button")
        element.tabIndex = 0
      })
    })
  })

  createEffect(() => {
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (!activateMarkdownArtifact(event.target)) return
      event.preventDefault()
      event.stopPropagation()
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return
      if (!activateMarkdownArtifact(event.target)) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener("click", click, true)
    window.addEventListener("keydown", keydown, true)
    onCleanup(() => {
      window.removeEventListener("click", click, true)
      window.removeEventListener("keydown", keydown, true)
    })
  })

  const openBrowser = () => {
    const value = cmcc.browser.draft.trim()
    if (!value) return
    const url = /^https?:\/\//i.test(value) ? value : `https://${value}`
    const history = [...cmcc.browser.history.slice(0, cmcc.browser.historyIndex + 1), url]
    setCmcc("browser", {
      draft: url,
      url,
      document: undefined,
      title: "浏览器",
      history,
      historyIndex: history.length - 1,
      revision: cmcc.browser.revision + 1,
    })
  }

  const navigateBrowser = (index: number) => {
    const url = cmcc.browser.history[index]
    if (!url) return
    setCmcc("browser", {
      draft: url,
      url,
      document: undefined,
      title: "浏览器",
      historyIndex: index,
      revision: cmcc.browser.revision + 1,
    })
  }

  const closeBrowser = () => {
    setCmcc("browser", {
      draft: "",
      url: "",
      document: undefined,
      title: "浏览器",
      history: [],
      historyIndex: -1,
      revision: cmcc.browser.revision + 1,
    })
    setCmcc("activeArtifact", undefined)
  }

  const [store, setStore] = createStore({
    activeDraggable: undefined as string | undefined,
  })

  const handleDragStart = (event: unknown) => {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeDraggable", id)
  }

  const handleDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (!draggable || !droppable) return

    const currentTabs = tabs().all()
    const toIndex = getTabReorderIndex(currentTabs, draggable.id.toString(), droppable.id.toString())
    if (toIndex === undefined) return
    tabs().move(draggable.id.toString(), toIndex)
  }

  const handleDragEnd = () => {
    setStore("activeDraggable", undefined)
  }

  createEffect(() => {
    if (!file.ready()) return

    setSessionHandoff(sessionKey(), {
      files: tabs()
        .all()
        .reduce<Record<string, SelectedLineRange | null>>((acc, tab) => {
          const path = file.pathFromTab(tab)
          if (!path) return acc

          const selected = file.selectedLines(path)
          acc[path] =
            selected && typeof selected === "object" && "start" in selected && "end" in selected
              ? (selected as SelectedLineRange)
              : null

          return acc
        }, {}),
    })
  })

  return (
    <Show when={isDesktop() && !(settings.general.newLayoutDesigns() && !params.id)}>
      <aside
        id="review-panel"
        aria-label={language.t("session.panel.reviewAndFiles")}
        aria-hidden={!open()}
        inert={!open()}
        class="relative min-w-0 h-full flex shrink-0 overflow-hidden bg-background-base"
        classList={{
          "pointer-events-none": !open(),
          "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
            !props.size.active() && !props.reviewSnap,
          "rounded-[10px] shadow-[var(--v2-elevation-raised)] overflow-hidden":
            settings.general.newLayoutDesigns() && !props.plain,
          "flex-1": reviewOpen() && !props.width,
        }}
        style={{ width: panelWidth() }}
      >
        <Show when={open()}>
          <div
            class="size-full flex"
            classList={{
              "border-l border-border-weaker-base": !settings.general.newLayoutDesigns(),
            }}
          >
            <div
              aria-hidden={!reviewOpen()}
              inert={!reviewOpen()}
              class="relative min-w-0 h-full flex-1 overflow-hidden bg-background-base"
              classList={{
                "pointer-events-none": !reviewOpen(),
              }}
            >
              <div class="size-full min-w-0 h-full bg-background-base">
                <Show
                  when={props.plain}
                  fallback={
                    <DragDropProvider
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      collisionDetector={closestCenter}
                    >
                      <DragDropSensors />
                      <ConstrainDragYAxis />
                      <Tabs value={activeTab()} onChange={openTab}>
                        <div class="sticky top-0 shrink-0 flex">
                          <Tabs.List
                            ref={(el: HTMLDivElement) => {
                              const stop = createFileTabListSync({ el, contextOpen })
                              onCleanup(stop)
                            }}
                          >
                            <Show when={reviewTab() && props.canReview()}>
                              <Tabs.Trigger value="review">
                                <div class="flex items-center gap-1.5">
                                  <div>{language.t("session.tab.review")}</div>
                                  <Show when={props.hasReview()}>
                                    <div>{props.reviewCount()}</div>
                                  </Show>
                                </div>
                              </Tabs.Trigger>
                            </Show>
                            <Show when={contextOpen()}>
                              <Tabs.Trigger
                                value="context"
                                closeButton={
                                  <TooltipKeybind
                                    title={language.t("common.closeTab")}
                                    keybind={command.keybind("tab.close")}
                                    placement="bottom"
                                    gutter={10}
                                  >
                                    <IconButton
                                      icon="close-small"
                                      variant="ghost"
                                      class="h-5 w-5"
                                      onClick={() => tabs().close("context")}
                                      aria-label={language.t("common.closeTab")}
                                    />
                                  </TooltipKeybind>
                                }
                                hideCloseButton
                                onMiddleClick={() => tabs().close("context")}
                              >
                                <div class="flex items-center gap-2">
                                  <SessionContextUsage variant="indicator" />
                                  <div>{language.t("session.tab.context")}</div>
                                </div>
                              </Tabs.Trigger>
                            </Show>
                            <SortableProvider ids={openedTabs()}>
                              <For each={openedTabs()}>
                                {(tab) => <SortableTab tab={tab} onTabClose={tabs().close} />}
                              </For>
                            </SortableProvider>
                            <div class="bg-background-stronger h-full shrink-0 sticky right-0 z-10 flex items-center justify-center pr-3">
                              <TooltipKeybind
                                title={language.t("command.file.open")}
                                keybind={command.keybind("file.open")}
                                class="flex items-center"
                              >
                                <IconButton
                                  icon="plus-small"
                                  variant="ghost"
                                  iconSize="large"
                                  class="!rounded-md"
                                  onClick={() => {
                                    void import("@/components/dialog-select-file").then((x) => {
                                      dialog.show(() => <x.DialogSelectFile mode="files" onOpenFile={showAllFiles} />)
                                    })
                                  }}
                                  aria-label={language.t("command.file.open")}
                                />
                              </TooltipKeybind>
                            </div>
                          </Tabs.List>
                        </div>

                        <Show when={reviewTab() && props.canReview()}>
                          <Tabs.Content value="review" class="flex flex-col h-full overflow-hidden contain-strict">
                            <Show when={reviewOpen() && activeTab() === "review"}>{props.reviewPanel()}</Show>
                          </Tabs.Content>
                        </Show>

                        <Tabs.Content value="empty" class="flex flex-col h-full overflow-hidden contain-strict">
                          <Show when={activeTab() === "empty"}>
                            <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                              <div class="h-full px-6 pb-42 -mt-4 flex flex-col items-center justify-center text-center gap-6">
                                <DeepInsightMark class="w-14 opacity-10" />
                                <div class="text-14-regular text-text-weak max-w-56">
                                  {language.t("session.files.selectToOpen")}
                                </div>
                              </div>
                            </div>
                          </Show>
                        </Tabs.Content>

                        <Show when={contextOpen()}>
                          <Tabs.Content value="context" class="flex flex-col h-full overflow-hidden contain-strict">
                            <Show when={activeTab() === "context"}>
                              <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                                <SessionContextTab />
                              </div>
                            </Show>
                          </Tabs.Content>
                        </Show>

                        <Show when={activeFileTab()} keyed>
                          {(tab) => <FileTabContent tab={tab} />}
                        </Show>
                      </Tabs>
                      <DragOverlay>
                        <Show when={store.activeDraggable} keyed>
                          {(tab) => {
                            const path = file.pathFromTab(tab)
                            return (
                              <div data-component="tabs-drag-preview">
                                <Show when={path}>{(p) => <FileVisual active path={p()} />}</Show>
                              </div>
                            )
                          }}
                        </Show>
                      </DragOverlay>
                    </DragDropProvider>
                  }
                >
                  <CmccAssistantPanel
                    active={cmcc.activeTab}
                    setActive={(tab) => setCmcc("activeTab", tab)}
                    todos={todos()}
                    artifacts={artifacts()}
                    activeArtifact={cmcc.activeArtifact}
                    openArtifacts={cmcc.openArtifacts}
                    clearActiveArtifact={() => setCmcc("activeArtifact", undefined)}
                    closeArtifact={closeArtifact}
                    browserDraft={cmcc.browser.draft}
                    browserUrl={cmcc.browser.url}
                    browserDocument={cmcc.browser.document}
                    browserTitle={cmcc.browser.title}
                    browserRevision={cmcc.browser.revision}
                    browserCanGoBack={cmcc.browser.historyIndex > 0}
                    browserCanGoForward={cmcc.browser.historyIndex < cmcc.browser.history.length - 1}
                    setBrowserDraft={(value) => setCmcc("browser", "draft", value)}
                    openBrowser={openBrowser}
                    browserBack={() => navigateBrowser(cmcc.browser.historyIndex - 1)}
                    browserForward={() => navigateBrowser(cmcc.browser.historyIndex + 1)}
                    browserReload={() => {
                      if (!cmcc.browser.url && !cmcc.browser.document) return
                      setCmcc("browser", "revision", (value) => value + 1)
                    }}
                    closeBrowser={closeBrowser}
                    openArtifact={openArtifact}
                    reviewCount={props.reviewCount()}
                    canReview={props.canReview()}
                    reviewPanel={props.reviewPanel}
                    showReview={reviewOpen() && cmcc.activeTab === "review"}
                  />
                </Show>
              </div>
            </div>

            <Show when={shown() && !props.plain}>
              <div
                id="file-tree-panel"
                aria-hidden={!fileOpen()}
                inert={!fileOpen()}
                class="relative min-w-0 h-full shrink-0 overflow-hidden"
                classList={{
                  "pointer-events-none": !fileOpen(),
                  "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
                    !props.size.active(),
                }}
                style={{ width: treeWidth() }}
              >
                <div
                  class="h-full flex flex-col overflow-hidden group/filetree"
                  classList={{ "border-l border-border-weaker-base": reviewOpen() }}
                >
                  <Tabs
                    variant="pill"
                    value={fileTreeTab()}
                    onChange={setFileTreeTabValue}
                    class="h-full"
                    data-scope="filetree"
                  >
                    <Tabs.List>
                      <Tabs.Trigger value="changes" class="flex-1" classes={{ button: "w-full" }}>
                        {props.reviewCount()}{" "}
                        {language.t(
                          props.reviewCount() === 1 ? "session.review.change.one" : "session.review.change.other",
                        )}
                      </Tabs.Trigger>
                      <Tabs.Trigger value="all" class="flex-1" classes={{ button: "w-full" }}>
                        {language.t("session.files.all")}
                      </Tabs.Trigger>
                    </Tabs.List>
                    <Tabs.Content value="changes" class="bg-background-stronger px-3 py-0">
                      <Switch>
                        <Match when={props.hasReview() || !props.diffsReady()}>
                          <Show
                            when={props.diffsReady()}
                            fallback={
                              <div class="px-2 py-2 text-12-regular text-text-weak">
                                {language.t("common.loading")}
                                {language.t("common.loading.ellipsis")}
                              </div>
                            }
                          >
                            <FileTree
                              path={artifactRoot() ?? ""}
                              class="pt-3"
                              allowed={diffFiles()}
                              kinds={kinds()}
                              draggable={false}
                              active={props.activeDiff}
                              onFileClick={(node) => props.focusReviewDiff(node.path)}
                            />
                          </Show>
                        </Match>
                      </Switch>
                    </Tabs.Content>
                    <Tabs.Content value="all" class="bg-background-stronger px-3 py-0">
                      <Switch>
                        <Match when={nofiles()}>{empty(language.t("session.files.empty"))}</Match>
                        <Match when={true}>
                          <FileTree
                            path={artifactRoot() ?? ""}
                            class="pt-3"
                            modified={diffFiles()}
                            kinds={kinds()}
                            onFileClick={(node) => openTab(file.tab(node.path))}
                          />
                        </Match>
                      </Switch>
                    </Tabs.Content>
                  </Tabs>
                </div>
                <Show when={fileOpen()}>
                  <div onPointerDown={() => props.size.start()}>
                    <ResizeHandle
                      direction="horizontal"
                      edge="start"
                      size={layout.fileTree.width()}
                      min={200}
                      max={480}
                      onResize={(width) => {
                        props.size.touch()
                        layout.fileTree.resize(width)
                      }}
                    />
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </aside>
    </Show>
  )
}

function CmccAssistantPanel(props: {
  active: CmccPanelTab
  setActive: (tab: CmccPanelTab) => void
  todos: Todo[]
  artifacts: CmccArtifact[]
  activeArtifact?: string
  openArtifacts: string[]
  clearActiveArtifact: () => void
  closeArtifact: (path: string) => void
  browserDraft: string
  browserUrl: string
  browserDocument?: string
  browserTitle: string
  browserRevision: number
  browserCanGoBack: boolean
  browserCanGoForward: boolean
  setBrowserDraft: (value: string) => void
  openBrowser: () => void
  browserBack: () => void
  browserForward: () => void
  browserReload: () => void
  closeBrowser: () => void
  openArtifact: (path: string) => void
  reviewCount: number
  canReview: boolean
  reviewPanel: () => JSX.Element
  showReview: boolean
}) {
  const tabs = createMemo(() => [
    { id: "plan" as const, label: "计划", count: props.todos.length },
    { id: "artifacts" as const, label: "产出", count: props.artifacts.length },
    { id: "browser" as const, label: "浏览器" },
    { id: "review" as const, label: "审查", count: props.reviewCount },
  ])

  return (
    <div class="flex size-full min-w-0 flex-col bg-v2-background-bg-base">
      <div class="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-1 border-b border-v2-border-border-base bg-v2-background-bg-base px-3">
        <For each={tabs()}>
          {(tab) => (
            <button
              type="button"
              class="flex h-8 min-w-0 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] leading-4 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base"
              data-selected={props.active === tab.id ? "" : undefined}
              onClick={() => props.setActive(tab.id)}
            >
              <span>{tab.label}</span>
              <Show when={tab.count !== undefined}>
                <span class="text-[11px] leading-4 text-v2-text-text-faint">{tab.count}</span>
              </Show>
            </button>
          )}
        </For>
      </div>
      <Show when={props.openArtifacts.length > 0 && (props.active === "artifacts" || props.active === "browser")}>
        <CmccArtifactTabs
          paths={props.openArtifacts}
          active={props.activeArtifact}
          open={props.openArtifact}
          close={props.closeArtifact}
        />
      </Show>
      <div class="min-h-0 flex-1 overflow-hidden">
        <Switch>
          <Match when={props.active === "plan"}>
            <CmccPlanPanel todos={props.todos} />
          </Match>
          <Match when={props.active === "artifacts"}>
            <CmccArtifactsPanel
              artifacts={props.artifacts}
              activeArtifact={props.activeArtifact}
              clearActiveArtifact={props.clearActiveArtifact}
              openArtifact={props.openArtifact}
            />
          </Match>
          <Match when={props.active === "browser"}>
            <CmccBrowserPanel
              draft={props.browserDraft}
              url={props.browserUrl}
              document={props.browserDocument}
              title={props.browserTitle}
              revision={props.browserRevision}
              canGoBack={props.browserCanGoBack}
              canGoForward={props.browserCanGoForward}
              setDraft={props.setBrowserDraft}
              open={props.openBrowser}
              back={props.browserBack}
              forward={props.browserForward}
              reload={props.browserReload}
              close={props.closeBrowser}
            />
          </Match>
          <Match when={props.active === "review"}>
            <Show
              when={props.canReview}
              fallback={
                <CmccEmptyPanel title="暂无审查内容" description="这里会展示代码审查、变更摘要和回滚相关信息。" />
              }
            >
              <Show when={props.showReview}>{props.reviewPanel()}</Show>
            </Show>
          </Match>
        </Switch>
      </div>
    </div>
  )
}

function CmccArtifactTabs(props: {
  paths: string[]
  active?: string
  open: (path: string) => void
  close: (path: string) => void
}) {
  return (
    <div
      data-cmcc-artifact-tabs
      class="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-v2-border-border-base bg-v2-background-bg-layer-01 px-2"
    >
      <For each={props.paths}>
        {(path) => {
          const extension = () => fileName(path).split(".").at(-1)?.toLowerCase() ?? ""
          return (
            <div
              data-cmcc-artifact-tab={path}
              data-selected={props.active === path ? "" : undefined}
              class="group flex h-7 max-w-48 shrink-0 items-center rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-02 text-[12px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base data-[selected]:border-v2-border-border-active data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base"
              title={path}
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-2"
                onClick={() => props.open(path)}
              >
                <span
                  class="flex size-4 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-semibold uppercase text-white"
                  classList={{
                    "bg-blue-500": extension() === "doc" || extension() === "docx",
                    "bg-green-600": extension() === "xls" || extension() === "xlsx",
                    "bg-red-500": extension() === "pdf" || extension() === "ppt" || extension() === "pptx",
                    "bg-cyan-600": extension() === "html" || extension() === "htm",
                    "bg-slate-500": !["doc", "docx", "xls", "xlsx", "pdf", "ppt", "pptx", "html", "htm"].includes(
                      extension(),
                    ),
                  }}
                >
                  {extension().slice(0, 1) || "F"}
                </span>
                <span class="min-w-0 flex-1 truncate">{fileName(path)}</span>
              </button>
              <button
                type="button"
                aria-label={`关闭 ${fileName(path)}`}
                class="mr-1 flex size-4 shrink-0 items-center justify-center rounded text-[14px] leading-none text-v2-text-text-faint opacity-60 hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base group-hover:opacity-100"
                onClick={() => props.close(path)}
              >
                ×
              </button>
            </div>
          )
        }}
      </For>
    </div>
  )
}

function CmccPlanPanel(props: { todos: Todo[] }) {
  return (
    <div class="h-full overflow-y-auto px-4 py-4">
      <Show
        when={props.todos.length > 0}
        fallback={<CmccEmptyPanel title="暂无计划" description="当助手制定或执行计划时，步骤会在这里按状态展示。" />}
      >
        <div class="space-y-2">
          <For each={props.todos}>
            {(todo, index) => (
              <div class="rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 py-2.5">
                <div class="flex items-start gap-2">
                  <div
                    class="mt-1 size-2 rounded-full bg-v2-icon-icon-muted data-[state=completed]:bg-success data-[state=in_progress]:bg-v2-border-border-active data-[state=cancelled]:bg-v2-text-text-faint"
                    data-state={todo.status}
                    aria-hidden="true"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="text-[13px] font-medium leading-5 text-v2-text-text-base">
                      {index() + 1}. {todo.content}
                    </div>
                    <div class="mt-1 flex items-center gap-2 text-[11px] leading-4 text-v2-text-text-faint">
                      <span>{todoStatusLabel(todo.status)}</span>
                      <span>{todo.priority}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

function CmccArtifactsPanel(props: {
  artifacts: CmccArtifact[]
  activeArtifact?: string
  clearActiveArtifact: () => void
  openArtifact: (path: string) => void
}) {
  const file = useFile()
  const sdk = useSDK()
  const [contextMenu, setContextMenu] = createSignal<{ artifact: CmccArtifact; x: number; y: number }>()
  const [downloading, setDownloading] = createSignal<string>()
  const selected = createMemo(() => props.artifacts.find((item) => item.path === props.activeArtifact))
  const downloadable = createMemo(() => props.artifacts.filter((item) => item.status !== "deleted"))
  const state = createMemo(() => {
    const item = selected()
    if (!item) return
    return file.get(item.path)
  })
  const download = (path: string) => {
    setDownloading(path)
    void sdk()
      .client.file.download({ path })
      .then((result) => {
        if (!(result.data instanceof Blob)) throw new Error("服务器未返回文件内容")
        downloadBlob(result.data, fileName(path))
      })
      .catch((error: unknown) => {
        showToast({ title: "下载失败", description: error instanceof Error ? error.message : String(error) })
      })
      .finally(() => setDownloading(undefined))
  }
  const downloadAll = () => {
    const paths = downloadable().map((item) => item.path)
    if (paths.length === 0) return
    setDownloading("all")
    void sdk()
      .client.file.archive({ paths })
      .then((result) => {
        if (!(result.data instanceof Blob)) throw new Error("服务器未返回压缩包")
        downloadBlob(result.data, "产出文件.zip")
      })
      .catch((error: unknown) => {
        showToast({ title: "批量下载失败", description: error instanceof Error ? error.message : String(error) })
      })
      .finally(() => setDownloading(undefined))
  }

  createEffect(() => {
    const item = selected()
    if (!item) return
    void file.load(item.path)
  })

  return (
    <div class="h-full overflow-hidden px-4 py-4">
      <Show
        when={props.artifacts.length > 0}
        fallback={<CmccEmptyPanel title="暂无文件产出" description="助手生成、修改或补丁涉及的文件会汇总到这里。" />}
      >
        <Show when={contextMenu()}>
          {(menu) => (
            <>
              <div class="fixed inset-0 z-40" onMouseDown={() => setContextMenu(undefined)} />
              <div
                class="fixed z-50 min-w-36 rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-02 py-1 shadow-[var(--v2-elevation-raised)]"
                style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  class="block w-full px-3 py-1.5 text-left text-[13px] leading-5 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                  onClick={() => {
                    props.openArtifact(menu().artifact.path)
                    setContextMenu(undefined)
                  }}
                >
                  预览
                </button>
                <button
                  type="button"
                  disabled={menu().artifact.status === "deleted" || downloading() !== undefined}
                  class="block w-full px-3 py-1.5 text-left text-[13px] leading-5 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    download(menu().artifact.path)
                    setContextMenu(undefined)
                  }}
                >
                  下载
                </button>
              </div>
            </>
          )}
        </Show>
        <Show
          when={selected()}
          fallback={
            <div class="flex h-full min-h-0 flex-col">
              <Show when={downloadable().length > 1}>
                <div class="mb-3 flex justify-end">
                  <button
                    type="button"
                    disabled={downloading() !== undefined}
                    class="h-8 shrink-0 rounded-[6px] bg-v2-background-bg-layer-03 px-2.5 text-[13px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={downloadAll}
                  >
                    {downloading() === "all" ? "正在打包..." : `全部下载（${downloadable().length}）`}
                  </button>
                </div>
              </Show>
              <div class="min-h-0 flex-1 space-y-2 overflow-y-auto">
                <For each={props.artifacts}>
                  {(item) => (
                    <button
                      type="button"
                      class="flex w-full min-w-0 items-center gap-2 rounded-[6px] px-2 py-1.5 text-left hover:bg-v2-overlay-simple-overlay-hover"
                      title={item.path}
                      onClick={() => props.openArtifact(item.path)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setContextMenu({ artifact: item, x: event.clientX, y: event.clientY })
                      }}
                    >
                      <div class="flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-v2-border-border-active text-[9px] font-medium uppercase text-white">
                        {fileName(item.path).split(".").at(-1)?.slice(0, 1) ?? "F"}
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-[13px] leading-5 text-v2-text-text-base">{fileName(item.path)}</div>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>
          }
        >
          {(item) => (
            <div class="flex h-full min-h-0 flex-col">
              <div class="mb-3 flex items-center gap-2">
                <button
                  type="button"
                  class="h-8 shrink-0 rounded-[6px] bg-v2-background-bg-layer-03 px-2.5 text-[13px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                  onClick={props.clearActiveArtifact}
                >
                  返回
                </button>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[13px] font-medium leading-5 text-v2-text-text-base">
                    {fileName(item().path)}
                  </div>
                  <div class="text-[11px] leading-4 text-v2-text-text-faint">{item().source}</div>
                </div>
                <button
                  type="button"
                  disabled={item().status === "deleted" || downloading() !== undefined}
                  class="h-8 shrink-0 rounded-[6px] bg-v2-background-bg-layer-03 px-2.5 text-[13px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => download(item().path)}
                >
                  {downloading() === item().path ? "下载中..." : "下载"}
                </button>
              </div>
              <div class="min-h-0 flex-1 overflow-hidden rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-01">
                <Switch>
                  <Match when={state()?.loaded}>
                    <Show when={state()?.content}>
                      {(content) => <ArtifactPreview path={item().path} content={content()} />}
                    </Show>
                  </Match>
                  <Match when={state()?.loading}>
                    <div class="px-4 py-3 text-[13px] text-v2-text-text-muted">加载中...</div>
                  </Match>
                  <Match when={state()?.error}>
                    {(error) => <div class="px-4 py-3 text-[13px] text-v2-text-text-muted">{error()}</div>}
                  </Match>
                </Switch>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}

function CmccBrowserPanel(props: {
  draft: string
  url: string
  document?: string
  title: string
  revision: number
  canGoBack: boolean
  canGoForward: boolean
  setDraft: (value: string) => void
  open: () => void
  back: () => void
  forward: () => void
  reload: () => void
  close: () => void
}) {
  const buttonClass =
    "flex size-8 shrink-0 items-center justify-center rounded-[6px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-v2-text-text-muted"

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex h-12 shrink-0 items-center gap-1 border-b border-v2-border-border-base bg-v2-background-bg-base px-3">
        <IconButton
          icon="arrow-left"
          variant="ghost"
          class={buttonClass}
          disabled={!props.canGoBack}
          onClick={props.back}
          aria-label="后退"
        />
        <IconButton
          icon="arrow-right"
          variant="ghost"
          class={buttonClass}
          disabled={!props.canGoForward}
          onClick={props.forward}
          aria-label="前进"
        />
        <button
          type="button"
          class={buttonClass}
          disabled={!props.url && !props.document}
          onClick={props.reload}
          aria-label="刷新"
          title="刷新"
        >
          <svg viewBox="0 0 20 20" class="size-5" fill="none" aria-hidden="true">
            <path
              d="M16.7 6.7V2.9m0 0h-3.8m3.8 0-2.5 2.5A6.7 6.7 0 1 0 16.5 12"
              stroke="currentColor"
              stroke-width="1.25"
              stroke-linecap="square"
              stroke-linejoin="miter"
            />
          </svg>
        </button>
        <form
          class="mx-2 min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            props.open()
          }}
        >
          <input
            aria-label="URL"
            placeholder="输入 URL"
            class="h-8 w-full min-w-0 rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 text-center text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-active focus:text-left"
            value={props.draft}
            onInput={(event) => props.setDraft(event.currentTarget.value)}
          />
        </form>
        <IconButton
          icon="close"
          variant="ghost"
          class={buttonClass}
          disabled={!props.url && !props.document && !props.draft}
          onClick={props.close}
          aria-label="关闭页面"
        />
      </div>
      <Show
        when={(props.url || props.document) && props.revision}
        fallback={
          <div class="flex min-h-0 flex-1 items-center justify-center px-8 pb-12 text-center">
            <div class="flex flex-col items-center">
              <svg viewBox="0 0 48 48" class="size-12 text-v2-text-text-muted" fill="none" aria-hidden="true">
                <circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="2.5" />
                <path
                  d="M6 24h36M24 6c6 5 9 11 9 18s-3 13-9 18c-6-5-9-11-9-18s3-13 9-18Z"
                  stroke="currentColor"
                  stroke-width="2.5"
                />
              </svg>
              <div class="mt-5 text-[20px] font-medium leading-7 text-v2-text-text-base">开始浏览</div>
              <div class="mt-2 text-[14px] leading-5 text-v2-text-text-muted">输入 URL 以打开页面</div>
            </div>
          </div>
        }
        keyed
      >
        {(_) => (
          <iframe
            title={props.title}
            class="min-h-0 flex-1 border-0 bg-white"
            src={props.document ? undefined : props.url}
            srcdoc={props.document}
            sandbox={
              props.document
                ? "allow-forms allow-popups allow-scripts"
                : "allow-forms allow-popups allow-same-origin allow-scripts"
            }
          />
        )}
      </Show>
    </div>
  )
}

function CmccEmptyPanel(props: { title: string; description: string }) {
  return (
    <div class="flex h-full items-center justify-center px-8 text-center">
      <div>
        <div class="text-[14px] font-medium leading-5 text-v2-text-text-base">{props.title}</div>
        <div class="mt-2 text-[12px] leading-5 text-v2-text-text-muted">{props.description}</div>
      </div>
    </div>
  )
}
