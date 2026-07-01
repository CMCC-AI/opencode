import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { Tabs } from "@opencode-ai/ui/tabs"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Mark } from "@opencode-ai/ui/logo"
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import type { Part, SnapshotFileDiff, Todo, VcsFileDiff } from "@opencode-ai/sdk/v2"
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd"
import { useDialog } from "@opencode-ai/ui/context/dialog"

import FileTree from "@/components/file-tree"
import { SessionContextUsage } from "@/components/session-context-usage"
import { SessionContextTab, SortableTab, FileVisual } from "@/components/session"
import { useCommand } from "@/context/command"
import { useFile, type SelectedLineRange } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useSettings } from "@/context/settings"
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

type RenderDiff = (SnapshotFileDiff & { file: string }) | VcsFileDiff
type CmccPanelTab = "plan" | "artifacts" | "browser" | "review"
type CmccArtifact = {
  id: string
  path: string
  source: string
  status: "created" | "changed" | "deleted"
}

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

function artifactStatusLabel(value: CmccArtifact["status"]) {
  if (value === "created") return "新建"
  if (value === "deleted") return "删除"
  return "更新"
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
  const [cmccActiveTab, setCmccActiveTab] = createSignal<CmccPanelTab>("plan")
  const [browserDraft, setBrowserDraft] = createSignal("https://www.google.com/search?igu=1")
  const [browserUrl, setBrowserUrl] = createSignal("https://www.google.com/search?igu=1")

  const diffs = createMemo(() => props.diffs().filter(renderDiff))
  const diffFiles = createMemo(() => diffs().map((d) => d.file))
  const todos = createMemo(() => {
    if (!params.id) return []
    return serverSync().session.data.todo[params.id] ?? []
  })
  const parts = createMemo(() => {
    if (!params.id) return []
    return (sync().data.message[params.id] ?? []).flatMap((message) => sync().data.part[message.id] ?? [])
  })
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
        for (const path of part.files) {
          items.set(path, {
            id: `${part.id}:${path}`,
            path,
            source: "补丁产出",
            status: "changed",
          })
        }
      }
      if (part.type === "tool" && ["write", "edit", "apply_patch"].includes(part.tool)) {
        const path = toolPath(part)
        if (!path) continue
        items.set(path, {
          id: `${part.id}:${path}`,
          path,
          source: part.tool === "write" ? "文件写入" : "文件编辑",
          status: part.tool === "write" ? "created" : "changed",
        })
      }
    }

    return [...items.values()]
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
    const state = file.tree.state("")
    if (!state?.loaded) return false
    return file.tree.children("").length === 0
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
    openTab(file.tab(path))
  }

  const openBrowser = () => {
    const value = browserDraft().trim()
    if (!value) return
    const url = /^https?:\/\//i.test(value) ? value : `https://${value}`
    setBrowserDraft(url)
    setBrowserUrl(url)
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
          "flex-1": reviewOpen(),
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
                          <For each={openedTabs()}>{(tab) => <SortableTab tab={tab} onTabClose={tabs().close} />}</For>
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
                            <Mark class="w-14 opacity-10" />
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
                    active={cmccActiveTab()}
                    setActive={setCmccActiveTab}
                    todos={todos()}
                    artifacts={artifacts()}
                    browserDraft={browserDraft()}
                    browserUrl={browserUrl()}
                    setBrowserDraft={setBrowserDraft}
                    openBrowser={openBrowser}
                    openArtifact={openArtifact}
                    reviewCount={props.reviewCount()}
                    canReview={props.canReview()}
                    reviewPanel={props.reviewPanel}
                    showReview={reviewOpen() && cmccActiveTab() === "review"}
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
                              path=""
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
                            path=""
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
  browserDraft: string
  browserUrl: string
  setBrowserDraft: (value: string) => void
  openBrowser: () => void
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
      <div class="min-h-0 flex-1 overflow-hidden">
        <Switch>
          <Match when={props.active === "plan"}>
            <CmccPlanPanel todos={props.todos} />
          </Match>
          <Match when={props.active === "artifacts"}>
            <CmccArtifactsPanel artifacts={props.artifacts} openArtifact={props.openArtifact} />
          </Match>
          <Match when={props.active === "browser"}>
            <CmccBrowserPanel
              draft={props.browserDraft}
              url={props.browserUrl}
              setDraft={props.setBrowserDraft}
              open={props.openBrowser}
            />
          </Match>
          <Match when={props.active === "review"}>
            <Show
              when={props.canReview}
              fallback={<CmccEmptyPanel title="暂无审查内容" description="这里会展示代码审查、变更摘要和回滚相关信息。" />}
            >
              <Show when={props.showReview}>{props.reviewPanel()}</Show>
            </Show>
          </Match>
        </Switch>
      </div>
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

function CmccArtifactsPanel(props: { artifacts: CmccArtifact[]; openArtifact: (path: string) => void }) {
  return (
    <div class="h-full overflow-y-auto px-4 py-4">
      <Show
        when={props.artifacts.length > 0}
        fallback={<CmccEmptyPanel title="暂无文件产出" description="助手生成、修改或补丁涉及的文件会汇总到这里。" />}
      >
        <div class="space-y-2">
          <For each={props.artifacts}>
            {(item) => (
              <button
                type="button"
                class="flex w-full min-w-0 items-start gap-3 rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 py-2.5 text-left hover:bg-v2-overlay-simple-overlay-hover"
                onClick={() => props.openArtifact(item.path)}
              >
                <div class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-v2-background-bg-layer-03 text-[11px] text-v2-text-text-muted">
                  {artifactStatusLabel(item.status)}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[13px] font-medium leading-5 text-v2-text-text-base">{item.path}</div>
                  <div class="mt-1 text-[11px] leading-4 text-v2-text-text-faint">{item.source}</div>
                </div>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

function CmccBrowserPanel(props: {
  draft: string
  url: string
  setDraft: (value: string) => void
  open: () => void
}) {
  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex shrink-0 gap-2 border-b border-v2-border-border-base p-3">
        <input
          class="h-8 min-w-0 flex-1 rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2 text-[13px] text-v2-text-text-base outline-none focus:border-v2-border-border-active"
          value={props.draft}
          onInput={(event) => props.setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            props.open()
          }}
        />
        <button
          type="button"
          class="h-8 shrink-0 rounded-[6px] bg-v2-background-bg-layer-03 px-3 text-[13px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
          onClick={props.open}
        >
          打开
        </button>
      </div>
      <iframe
        title="浏览器"
        class="min-h-0 flex-1 border-0 bg-white"
        src={props.url}
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
      />
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
