import { Show, type ParentProps } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"

export function CmccPromptPanel(
  props: ParentProps<{
    title: string
    description?: string
    onClose: () => void
  }>,
) {
  return (
    <section
      role="dialog"
      aria-label={props.title}
      data-component="cmcc-prompt-panel"
      class="flex max-h-[min(420px,45dvh)] w-full min-w-0 flex-col overflow-hidden rounded-[14px] border border-v2-border-border-base bg-v2-background-bg-layer-01 shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
    >
      <header class="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-v2-border-border-base px-4 py-3">
        <div class="min-w-0">
          <h2 class="text-[14px] font-medium leading-5 text-v2-text-text-base">{props.title}</h2>
          <Show when={props.description}>
            <p class="mt-1 text-[12px] leading-5 text-v2-text-text-muted">{props.description}</p>
          </Show>
        </div>
        <button
          type="button"
          class="flex size-8 shrink-0 items-center justify-center rounded-[7px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover"
          aria-label={`关闭${props.title}`}
          onClick={props.onClose}
        >
          <Icon name="close" class="size-4" />
        </button>
      </header>
      <div class="min-h-0 overflow-y-auto overscroll-contain">{props.children}</div>
    </section>
  )
}
