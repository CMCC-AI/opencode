import { Show, type JSX } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import type { CmccHistoryProduct } from "@/utils/cmcc-history-product"

export function CmccHistoryRow(props: {
  title: string
  active: boolean
  running: boolean
  product?: CmccHistoryProduct
  timeLabel: string
  knowledgeName?: string
  disabled?: boolean
  source: "opencode" | "langgraph"
  onOpen: () => void
  menu: JSX.Element
  menuLabel?: string
}) {
  return (
    <div
      data-component="cmcc-history-row"
      data-source={props.source}
      class="group/session relative mb-0.5 flex min-h-12 w-full min-w-0 items-center rounded-[6px] text-[#4a4a6a] transition-colors duration-150 hover:bg-[rgba(99,102,241,0.06)] data-[selected]:bg-[rgba(99,102,241,0.10)] data-[selected]:text-[#4f46e5]"
      data-selected={props.active ? "" : undefined}
      data-running={props.running ? "" : undefined}
    >
      <button
        type="button"
        class="flex min-h-12 w-full min-w-0 items-center rounded-[6px] px-2.5 py-1.5 pr-9 text-left"
        disabled={props.disabled}
        onClick={props.onOpen}
      >
        <span class="min-w-0 flex-1">
          <span class="flex min-w-0 items-center gap-1.5">
            <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{props.title}</span>
            <Show when={props.product}>
              {(product) => (
                <span
                  data-slot="session-product-label"
                  class="max-w-[104px] shrink-0 truncate rounded-full border px-1.5 py-0.5 text-[11px] font-normal leading-[1.4]"
                  title={product().label}
                  style={{
                    color: product().textColor,
                    background: product().backgroundColor,
                    "border-color": product().borderColor,
                  }}
                >
                  {product().label}
                </span>
              )}
            </Show>
            <Show when={props.knowledgeName}>
              {(name) => (
                <span
                  class="max-w-[104px] shrink-0 truncate rounded-full bg-[#ede9fe] px-1.5 py-0.5 text-[11px] font-normal leading-[1.4] text-[#5b4fd7]"
                  title={`知识库：${name()}`}
                >
                  知识库 · {name()}
                </span>
              )}
            </Show>
          </span>
          <span data-slot="session-time" class="mt-0.5 block text-[11px] font-normal leading-none text-[#8b8daf]">
            {props.timeLabel}
          </span>
        </span>
      </button>
      <Show when={props.running}>
        <span
          data-slot="session-running-indicator"
          role="status"
          aria-label="任务进行中"
          title="任务进行中"
          class="pointer-events-none absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-[#4f46e5] transition-opacity group-hover/session:opacity-0 group-focus-within/session:opacity-0"
        >
          <svg data-slot="session-running-spinner" viewBox="0 0 16 16" class="size-3.5" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="5.25" stroke="currentColor" stroke-width="1.5" opacity="0.22" />
            <circle
              cx="8"
              cy="8"
              r="5.25"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-dasharray="7 26"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 8 8"
                to="360 8 8"
                dur="0.8s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
        </span>
      </Show>
      <div class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover/session:opacity-100 group-focus-within/session:opacity-100">
        <DropdownMenu>
          <DropdownMenu.Trigger
            as="button"
            type="button"
            class="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-[#9294b5] hover:bg-[rgba(99,102,241,0.12)] hover:text-[#4f46e5] data-[expanded]:bg-[rgba(99,102,241,0.12)] data-[expanded]:text-[#4f46e5]"
            title="更多"
            aria-label={props.menuLabel ?? "更多"}
          >
            <Icon name="dot-grid" class="size-3.5" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="mt-1">{props.menu}</DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </div>
    </div>
  )
}
