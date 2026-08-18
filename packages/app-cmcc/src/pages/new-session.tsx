import { Show, createEffect, createResource, createSignal, untrack } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { NewSessionDesignView } from "@/components/session"
import { PromptInput } from "@/components/prompt-input"
import { useSettingsCommand } from "@/components/settings-dialog"
import { useComments } from "@/context/comments"
import { usePrompt } from "@/context/prompt"
import { useServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useTabs } from "@/context/tabs"
import { createPromptInputController } from "@/pages/session/composer"
import { useSessionKey } from "@/pages/session/session-layout"
import { useComposerCommands } from "@/pages/session/use-composer-commands"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

/**
 * The `/new-session` draft page. Unlike `session.tsx`, this only renders the prompt
 * composer for a brand-new session — no terminal, review pane, file tree, or message
 * timeline. Submitting promotes the draft into a real session (see prompt-input/submit).
 */
export default function NewSessionPage() {
  const prompt = usePrompt()
  const serverSync = useServerSync()
  const comments = useComments()
  const language = useLanguage()
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
    if (searchParams.draftId) tabs.updateDraft(searchParams.draftId, { agent })
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
    <div class="relative flex size-full min-h-0 flex-col overflow-hidden">
      <NewSessionDesignView>
        <Show
          when={prompt.ready() || promptReady()}
          fallback={
            <div class="w-full min-h-32 md:min-h-40 rounded-md border border-border-weak-base bg-background-base/50 px-4 py-3 text-text-weak pointer-events-none">
              {language.t("prompt.loading")}
            </div>
          }
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
      </NewSessionDesignView>
    </div>
  )
}
