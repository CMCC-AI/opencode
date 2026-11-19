import { Show, Suspense, createEffect, createResource, createSignal, lazy, untrack } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { NewSessionComposerLoading, NewSessionDesignView, NewSessionLoading } from "@/components/session/session-new-design-view"
import { PromptInput } from "@/components/prompt-input"
import { useSettingsCommand } from "@/components/settings-dialog"
import { useComments } from "@/context/comments"
import { usePrompt } from "@/context/prompt"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { createPromptInputController } from "@/pages/session/composer"
import { useSessionKey } from "@/pages/session/session-layout"
import { useComposerCommands } from "@/pages/session/use-composer-commands"
import { CMCC_TEAM_EXPERTS, cmccTeamExpertByAgent } from "@/utils/cmcc-experts"

const ResearchComposer = lazy(() => import("./general-deepinsight/research-composer"))

/**
 * The `/new-session` draft page. Unlike `session.tsx`, this only renders the prompt
 * composer for a brand-new session — no terminal, review pane, file tree, or message
 * timeline. Submitting promotes the draft into a real session (see prompt-input/submit).
 */
export default function NewSessionPage() {
  const tabs = useTabs()
  const [search] = useSearchParams<{ draftId?: string }>()
  const draft = () => tabs.store.find((tab) => tab.type === "draft" && tab.draftID === search.draftId)
  const team = () => {
    const tab = draft()
    return tab?.type === "draft" ? CMCC_TEAM_EXPERTS.find((expert) => expert.id === tab.expertID) : undefined
  }
  const managed = () => {
    const tab = draft()
    return tab?.type === "draft" && !!(tab.homeTeamPicker || tab.researchMode)
  }
  return (
    <div class="relative flex size-full min-h-0 flex-col overflow-hidden">
      <Suspense fallback={<NewSessionLoading team={team()} teamPicker={managed()} />}>
        <Show when={managed()} fallback={<NewSessionDesignView team={team()}><NewSessionComposer /></NewSessionDesignView>}>
          <ResearchComposer />
        </Show>
      </Suspense>
    </div>
  )
}

function NewSessionComposer() {
  const prompt = usePrompt()
  const serverSync = useServerSync()
  const comments = useComments()
  const tabs = useTabs()
  const route = useSessionKey()
  const [searchParams, setSearchParams] = useSearchParams<{ draftId?: string; prompt?: string; agent?: string }>()
  const draftAgent = () => {
    if (!searchParams.draftId) return
    const draft = tabs.store.find((tab) => tab.type === "draft" && tab.draftID === searchParams.draftId)
    return draft?.type === "draft" ? draft.agent : undefined
  }
  const [selectedExpertAgent, setSelectedExpertAgent] = createSignal(searchParams.agent ?? draftAgent())
  const selectExpertAgent = (agent: string | undefined) => {
    setSelectedExpertAgent(agent)
    if (searchParams.draftId) {
      tabs.updateDraft(searchParams.draftId, { agent, expertID: cmccTeamExpertByAgent(agent)?.id })
    }
  }

  useComposerCommands()
  useSettingsCommand()

  let inputRef: HTMLDivElement | undefined

  const inputController = createPromptInputController({
    sessionKey: route.sessionKey,
    sessionID: () => route.params.id,
    queryOptions: serverSync().queryOptions,
  })
  createEffect(() => {
    if (!prompt.ready()) return
    untrack(() => {
      const text = searchParams.prompt
      const agent = searchParams.agent
      if (agent) selectExpertAgent(agent)
      if (text) prompt.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
      if (text || agent) setSearchParams({ ...searchParams, prompt: undefined, agent: undefined })
    })
  })

  createEffect(() => {
    if (!prompt.ready()) return
    requestAnimationFrame(() => inputRef?.focus())
  })
  const ready = Promise.resolve()
  const [promptReady] = createResource(
    () => prompt.ready.promise ?? ready,
    (promise) => promise.then(() => true),
  )

  return (
    <Show
      when={prompt.ready() || promptReady()}
      fallback={<NewSessionComposerLoading />}
    >
      <div class="flex flex-col gap-3">
        <PromptInput
          controls={inputController()}
          variant="new-session"
          ref={(el) => {
            inputRef = el
          }}
          onSubmit={() => comments.clear()}
          selectedExpertAgent={selectedExpertAgent()}
          onSelectedExpertAgentChange={selectExpertAgent}
        />
      </div>
    </Show>
  )
}
