import { Icon } from "@opencode-ai/ui/icon"
import { Show, createUniqueId, onCleanup, onMount, type ParentProps } from "solid-js"
import { Portal } from "solid-js/web"
import "./cmcc-action-dialog.css"

export function DeleteConfirmation(
  props: ParentProps<{
    title: string
    message: string
    description: string
    pending?: boolean
    onCancel: () => void
    onConfirm: () => void
  }>,
) {
  const titleId = createUniqueId()
  const descriptionId = createUniqueId()
  let dialog!: HTMLDialogElement
  onMount(() => dialog.showModal())
  onCleanup(() => dialog.close())

  const cancel = () => {
    if (!props.pending) props.onCancel()
  }
  return (
    <Portal>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={props.pending}
        data-cmcc-delete-confirmation
        class="cmcc-action-dialog fixed inset-0 m-auto w-[calc(100%-24px)]"
        onCancel={(event) => {
          event.preventDefault()
          cancel()
        }}
        onClick={(event) => {
          if (event.target === dialog) cancel()
        }}
      >
        <header>
          <h2 id={titleId}>{props.title}</h2>
          <button type="button" aria-label="关闭" disabled={props.pending} class="cmcc-action-close" onClick={cancel}>
            <Icon name="close" class="size-4" />
          </button>
        </header>
        <div id={descriptionId} class="px-5 py-5">
          <p class="flex items-start gap-1.5 pl-3 text-[13px] leading-5 text-[#36393f]">
            <span
              aria-hidden="true"
              class="mt-0.5 inline-grid size-4 shrink-0 place-items-center rounded-full border border-[#ef5757] text-[11px] leading-none text-[#e84949]"
            >
              !
            </span>
            <span class="min-w-0 break-words">{props.message}</span>
          </p>
          <p class="cmcc-action-note">{props.description}</p>
          <Show when={props.children}>{props.children}</Show>
        </div>
        <footer>
          <button type="button" autofocus disabled={props.pending} class="cmcc-action-cancel" onClick={cancel}>
            取消
          </button>
          <button type="button" disabled={props.pending} class="cmcc-action-primary" onClick={props.onConfirm}>
            {props.pending ? "正在删除…" : "确认删除"}
          </button>
        </footer>
      </dialog>
    </Portal>
  )
}
