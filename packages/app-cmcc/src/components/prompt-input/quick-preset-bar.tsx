import { For, Show, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import type { TeamQuickPresets } from "@/utils/quick-presets"
import boltIcon from "./quick-preset-bolt.svg"
import analysisIcon from "./quick-preset-analysis.svg"
import arrowIcon from "./quick-preset-arrow.svg"
import "./quick-preset-bar.css"

function PresetIcon(props: { src: string; class?: string }) {
  return (
    <span
      aria-hidden="true"
      class={`quick-preset-icon ${props.class ?? ""}`}
      style={{ "--quick-preset-icon": `url("${props.src}")` }}
    />
  )
}

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
    <div class="quick-preset-bar" data-component="quick-preset-bar">
      <div class="quick-preset-modes" role="group" aria-label="快速场景">
        <button
          type="button"
          class="quick-preset-mode"
          aria-pressed={props.liteActive}
          onClick={() => {
            setState("itemId", undefined)
            props.onSelect({ lite: true, prompt: props.presets.lite.prompt })
          }}
        >
          <PresetIcon src={boltIcon} class="quick-preset-mode-icon" />
          {props.presets.lite.label}
        </button>
        <Show when={group()}>
          {(active) => (
            <>
              <span aria-hidden="true" class="quick-preset-divider" />
              <DropdownMenu modal={false} placement="bottom-start" gutter={6} overflowPadding={12}>
                <DropdownMenu.Trigger
                  class="quick-preset-mode"
                  aria-pressed={!props.liteActive}
                  aria-label={`选择分析大类，当前：${active().label}`}
                >
                  <PresetIcon src={analysisIcon} class="quick-preset-mode-icon" />
                  {active().label}
                  <PresetIcon src={arrowIcon} class="quick-preset-arrow" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content class="quick-preset-menu" aria-label="分析大类">
                    <DropdownMenu.RadioGroup
                      value={props.liteActive ? "" : active().id}
                      onChange={(groupId) => {
                        const selected = props.presets.groups.find((item) => item.id === groupId)
                        if (!selected) return
                        setState({ groupId: selected.id, itemId: undefined })
                        if (props.liteActive) props.onSelect({ lite: false })
                      }}
                    >
                      <For each={props.presets.groups}>
                        {(item) => (
                          <DropdownMenu.RadioItem value={item.id} class="quick-preset-menu-option" closeOnSelect>
                            {item.label}
                          </DropdownMenu.RadioItem>
                        )}
                      </For>
                    </DropdownMenu.RadioGroup>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </>
          )}
        </Show>
      </div>
      <Show when={!props.liteActive && group()}>
        {(active) => (
          <div class="quick-preset-items" role="group" aria-label={`${active().label}场景`}>
            <For each={active().items}>
              {(item) => (
                <button
                  type="button"
                  class="quick-preset-item"
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
