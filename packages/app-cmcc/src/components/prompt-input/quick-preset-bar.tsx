import { For, Show, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import type { TeamQuickPresets } from "@/utils/quick-presets"

export function QuickPresetBar(props: {
  presets: TeamQuickPresets
  liteActive: boolean
  onSelect: (input: { lite: boolean; prompt?: string }) => void
}) {
  const [state, setState] = createStore({
    groupId: props.presets.groups[0]?.id as string | undefined,
    itemId: undefined as string | undefined,
  })
  const group = createMemo(() => props.presets.groups.find((item) => item.id === state.groupId))
  return (
    <div class="flex w-full flex-col items-start gap-1.5 pt-2" data-component="quick-preset-bar">
      <div class="home-agent-control" role="group" aria-label="快速场景">
        <For each={props.presets.groups}>
          {(item) => (
            <button
              type="button"
              aria-pressed={!props.liteActive && state.groupId === item.id}
              onClick={() => {
                setState({ groupId: item.id, itemId: undefined })
                if (props.liteActive) props.onSelect({ lite: false })
              }}
            >
              {item.label}
            </button>
          )}
        </For>
        <span aria-hidden="true" class="mx-0.5 h-4 w-px self-center bg-[#dcdfe6]" />
        <button
          type="button"
          aria-pressed={props.liteActive}
          onClick={() => props.onSelect({ lite: true, prompt: props.presets.lite.prompt })}
        >
          {props.presets.lite.label}
        </button>
      </div>
      <Show when={!props.liteActive && group()}>
        {(active) => (
          <div class="home-agent-control" role="group" aria-label={`${active().label}场景`}>
            <For each={active().items}>
              {(item) => (
                <button
                  type="button"
                  aria-pressed={state.itemId === item.id}
                  onClick={() => {
                    setState("itemId", item.id)
                    props.onSelect({ lite: false, prompt: item.prompt })
                  }}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
        )}
      </Show>
    </div>
  )
}
