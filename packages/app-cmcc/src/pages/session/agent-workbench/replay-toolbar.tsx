import { Icon } from "@opencode-ai/ui/icon"
import { createSignal, Show } from "solid-js"
import "./results-panel.css"

const ACTION_CLASS =
  "h-9 shrink-0 whitespace-nowrap rounded-[18px] bg-[#eff6ff] px-3 text-[14px] font-bold text-[#3b82f6] transition hover:bg-[#e5efff] disabled:cursor-wait disabled:opacity-60 @min-[390px]:px-4"

export function WorkbenchReplayToolbar(props: {
  badge: string
  name: string
  preparing: boolean
  playing: boolean
  allowSameDuringReplay?: boolean
  stage: string
  progress: number
  onReplay: () => void
  onCreateSame?: () => void
}) {
  const [collapsed, setCollapsed] = createSignal(false)
  const toggleLabel = () => (collapsed() ? "展开操作条" : "收起操作条")
  return (
    <div class="workbench-replay-anchor" data-collapsed={collapsed() ? "" : undefined}>
      <div role="group" aria-label="回放与同款操作" class="workbench-replay-toolbar">
        <Show when={!collapsed()}>
          <div class="hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-[#2563eb] @min-[300px]:flex">
            <span class="flex size-[26px] items-center justify-center rounded-[8px] bg-[#eff6ff]">{props.badge}</span>
            <strong class="hidden font-semibold @min-[380px]:inline">{props.name}</strong>
          </div>
          <Show when={props.preparing || props.playing}>
            <div class="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-[#6b7280]">
              <span class="hidden @min-[390px]:inline">{props.preparing ? "准备回放" : props.stage}</span>
              <div class="h-[5px] w-10 overflow-hidden rounded-full bg-[#eef2ff] @min-[390px]:w-16">
                <span
                  class="block h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#6366f1] transition-[width] duration-300"
                  style={{ width: `${Math.round(props.progress * 100)}%` }}
                />
              </div>
            </div>
          </Show>
          <button
            type="button"
            class={ACTION_CLASS}
            disabled={props.preparing}
            aria-pressed={props.playing}
            onClick={props.onReplay}
          >
            {props.preparing ? "准备中" : props.playing ? "停止回放" : "看回放"}
          </button>
          <Show when={props.onCreateSame && !props.preparing && (!props.playing || props.allowSameDuringReplay)}>
            <button type="button" class={ACTION_CLASS} onClick={props.onCreateSame}>
              做同款
            </button>
          </Show>
        </Show>
        <button
          type="button"
          title={toggleLabel()}
          aria-label={toggleLabel()}
          aria-expanded={!collapsed()}
          onClick={() => setCollapsed(!collapsed())}
          class="grid size-8 shrink-0 place-items-center rounded-full hover:bg-[#f1f4f8]"
        >
          <Show when={collapsed()} fallback={<Icon name="chevron-right" />}>
            <span aria-hidden="true">{props.badge}</span>
          </Show>
        </button>
      </div>
    </div>
  )
}
