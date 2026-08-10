import {
  AppDirectoryScope,
  type ProductExtension,
  useServer,
  useServerSDK,
  useServerSync,
  useTabs,
} from "@opencode-ai/app"
import { showToast } from "@opencode-ai/app/extension"
import { Navigate, useParams } from "@solidjs/router"
import { createEffect, createMemo, Show } from "solid-js"
import { DeepInsightMark, DeepInsightWordmark } from "@cmcc/components/brand"
import { CmccPromptAccessory } from "@cmcc/components/prompt-accessory"
import { CmccSidebarRail } from "@cmcc/components/sidebar-rail"
import { CmccExpertCenterRoute, CmccExpertRoute } from "@cmcc/pages/cmcc-experts"
import { CmccKnowledgeHomeRoute, CmccKnowledgeNotebookRoute } from "@cmcc/pages/cmcc-knowledge"
import { CmccPluginHubRoute } from "@cmcc/pages/cmcc-plugin-hub"
import { cmccKnowledgeNotebooks } from "@cmcc/utils/cmcc-knowledge"
import { cmccCreateConversationWorkspace } from "@cmcc/utils/cmcc-workspace"

export const cmccProduct: ProductExtension = {
  id: "cmcc",
  name: "DeepInsight",
  mark: DeepInsightMark,
  wordmark: DeepInsightWordmark,
  home: CmccHomeRoute,
  sidebarRail: CmccSidebarRail,
  promptAccessory: CmccPromptAccessory,
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
  const sessionID = () => (params.sessionID === "new" ? undefined : params.sessionID ?? notebook()?.sessionID)

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
  const serverSDK = useServerSDK()
  const sync = useServerSync()
  const tabs = useTabs()
  const home = createMemo(() => sync().data.path.home)
  let started = false

  createEffect(() => {
    if (!home() || started || !tabs.ready()) return
    started = true
    void cmccCreateConversationWorkspace(home(), (directory) =>
      serverSDK().client.file.createDirectory({ path: directory }, { throwOnError: true }),
    )
      .then((directory) => {
        if (!directory) return
        tabs.newDraft({ server: server.key, directory })
      })
      .catch((error) => {
        showToast({
          title: "无法创建对话目录",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        })
      })
  })

  return (
    <div class="flex size-full items-center justify-center text-v2-text-text-faint">
      <DeepInsightMark class="h-10 w-8 opacity-30" />
    </div>
  )
}
