import { useSearchParams } from "@solidjs/router"
import { createEffect, untrack } from "solid-js"
import { usePromptInputV2Controller } from "@/components/prompt-input-v2"
import { useComments } from "@/context/comments"
import { useLocal } from "@/context/local"
import { usePrompt } from "@/context/prompt"
import { useProduct } from "@/context/product"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { createPromptInputController, createPromptProjectControls } from "@/pages/session/composer"
import { createPromptModelSelection } from "@/pages/session/composer/prompt-model-selection"
import { useSessionKey } from "@/pages/session/session-layout"
import { useComposerCommands } from "@/pages/session/use-composer-commands"

export function createNewSessionDraftController(workspace: { worktree: () => string; resetWorktree: () => void }) {
  const prompt = usePrompt()
  const serverSync = useServerSync()
  const comments = useComments()
  const local = useLocal()
  const tabs = useTabs()
  const route = useSessionKey()
  const product = useProduct()
  const [searchParams, setSearchParams] = useSearchParams<{ draftId?: string; prompt?: string; agent?: string }>()
  const model = createPromptModelSelection({ agent: () => local.agent.current() })
  const draftAgent = () => {
    if (searchParams.agent) return searchParams.agent
    if (!searchParams.draftId) return
    const draft = tabs.store.find((item) => item.type === "draft" && item.draftID === searchParams.draftId)
    return draft?.type === "draft" ? draft.agent : undefined
  }
  const selectedAgent = () => {
    const agent = draftAgent()
    if (!agent || !product.agentLabel?.(agent)) return
    return agent
  }
  const selectAgent = (agent: string | undefined) => {
    if (!searchParams.draftId) return
    tabs.updateDraft(searchParams.draftId, { agent })
  }

  createEffect(() => {
    const id = searchParams.draftId
    if (!id) return
    const draft = tabs.store.find((item) => item.type === "draft" && item.draftID === id)
    if (draft?.type !== "draft" || !draft.agent) return
    if (product.agentLabel?.(draft.agent)) return
    if (!local.agent.list().some((item) => item.name === draft.agent)) return
    if (local.agent.current()?.name === draft.agent) return
    local.agent.set(draft.agent)
  })

  useComposerCommands({ model })

  const controls = createPromptInputController({
    sessionKey: route.sessionKey,
    sessionID: () => route.params.id,
    queryOptions: serverSync().queryOptions,
    model,
  })
  const projectControls = createPromptProjectControls()
  const input = usePromptInputV2Controller({
    get controls() {
      return controls()
    },
    get newSessionWorktree() {
      return workspace.worktree()
    },
    onNewSessionWorktreeReset: workspace.resetWorktree,
    onSubmit: comments.clear,
    get selectedAgent() {
      return selectedAgent()
    },
    onSelectedAgentChange: selectAgent,
  })

  createEffect(() => {
    if (!prompt.ready()) return
    untrack(() => {
      const text = searchParams.prompt
      const agent = searchParams.agent
      if (agent) selectAgent(agent)
      if (text) prompt.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
      if (!text && !agent) return
      setSearchParams({ ...searchParams, prompt: undefined, agent: undefined })
    })
  })

  return {
    input,
    prompt: {
      ready: prompt.ready,
      readyPromise: () => prompt.ready.promise,
    },
    project: {
      controls: projectControls,
    },
  }
}

export type NewSessionDraftController = ReturnType<typeof createNewSessionDraftController>
