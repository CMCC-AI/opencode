import { AppDirectoryScope, type ProductExtension, useServer, useServerSync, useTabs } from "@opencode-ai/app"
import { Navigate, useParams } from "@solidjs/router"
import { createEffect, createMemo, Show } from "solid-js"
import { DeepInsightMark, DeepInsightWordmark } from "@cmcc/components/brand"
import { CmccPromptMenu } from "@cmcc/components/prompt-accessory"
import { CmccSidebarRail } from "@cmcc/components/sidebar-rail"
import { CmccExpertCenterRoute, CmccExpertRoute } from "@cmcc/pages/cmcc-experts"
import { CmccKnowledgeHomeRoute, CmccKnowledgeNotebookRoute } from "@cmcc/pages/cmcc-knowledge"
import { CmccPluginHubRoute } from "@cmcc/pages/cmcc-plugin-hub"
import { useDockApi, useDockApiSession } from "@cmcc/dockapi"
import { cmccKnowledgeNotebooks } from "@cmcc/utils/cmcc-knowledge"

export const cmccProduct: ProductExtension = {
  id: "cmcc",
  name: "DeepInsight",
  mark: DeepInsightMark,
  wordmark: DeepInsightWordmark,
  home: CmccHomeRoute,
  sidebarRail: CmccSidebarRail,
  promptMenu: CmccPromptMenu,
  sidebarClass: "bg-[linear-gradient(180deg,#d9e9ff_0%,#eae6ff_100%)]",
  promptClass: "rounded-[16px] border border-[#2c5dff] shadow-[0_4px_8px_rgba(50,6,249,0.15)]",
  hideModelProviders: true,
  hideModelVariants: true,
  session: useDockApiSession,
  routes: [
    { path: "/expert", component: CmccExpertCenterRoute },
    { path: "/expert/:id", component: CmccExpertRoute },
    { path: "/knowledge", component: CmccKnowledgeHomeRoute },
    { path: "/knowledge/:id/session/:sessionID", component: CmccKnowledgeRoute },
    { path: "/knowledge/:id", component: CmccKnowledgeRoute },
    { path: "/plugins", component: CmccPluginHubRoute },
  ],
  transformTranslation: (value) => value.replaceAll("OpenCode", "DeepInsight").replaceAll("opencode", "DeepInsight"),
}

function CmccKnowledgeRoute() {
  const params = useParams<{ id: string; sessionID?: string }>()
  const notebook = createMemo(() => cmccKnowledgeNotebooks().find((item) => item.id === params.id))
  const sessionID = () => (params.sessionID === "new" ? undefined : (params.sessionID ?? notebook()?.sessionID))

  return (
    <Show when={notebook()} fallback={<Navigate href="/knowledge" />} keyed>
      {(current) => (
        <AppDirectoryScope directory={current.directory} sessionID={sessionID}>
          <CmccKnowledgeNotebookRoute />
        </AppDirectoryScope>
      )}
    </Show>
  )
}

function CmccHomeRoute() {
  const server = useServer()
  const dockapi = useDockApi()
  const sync = useServerSync()
  const tabs = useTabs()
  let started = false

  createEffect(() => {
    const directory = dockapi.workspace?.directoryPath
    if (!directory || started || !tabs.ready()) return
    started = true
    server.projects.touch(directory)
    void sync().project.loadSessions(directory)
    tabs.newDraft({ server: server.key, directory })
  })

  return (
    <div class="flex size-full items-center justify-center text-v2-text-text-faint">
      <DeepInsightMark class="h-10 w-8 opacity-30" />
    </div>
  )
}
