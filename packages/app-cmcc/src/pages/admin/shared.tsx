import { Icon } from "@opencode-ai/ui/icon"
import { type ComponentProps, type ParentProps, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"

export function ToolButton(props: {
  label: string
  icon: ComponentProps<typeof Icon>["name"]
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      class="admin-tool"
      classList={{ danger: props.danger }}
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
    </button>
  )
}

export function AdminModal(props: ParentProps<{ title: string; pending?: boolean; onClose: () => void }>) {
  let element!: HTMLDialogElement
  onMount(() => element.showModal())
  onCleanup(() => element.close())
  return (
    <Portal>
      <dialog
        ref={element}
        class="admin-ui admin-modal"
        aria-label={props.title}
        onCancel={(event) => {
          event.preventDefault()
          if (!props.pending) props.onClose()
        }}
        onClick={(event) => {
          if (event.target === element && !props.pending) props.onClose()
        }}
      >
        <section onClick={(event) => event.stopPropagation()}>
          <header>
            <h2>{props.title}</h2>
            <ToolButton label="关闭" icon="close" disabled={props.pending} onClick={props.onClose} />
          </header>
          {props.children}
        </section>
      </dialog>
    </Portal>
  )
}

export function AdminError(props: { error: string; retry?: () => void }) {
  return (
    <Show when={props.error}>
      <div class="admin-error" role="alert">
        <span>{props.error}</span>
        <Show when={props.retry}>
          <button type="button" onClick={props.retry}>
            重试
          </button>
        </Show>
      </div>
    </Show>
  )
}

export function Pagination(props: {
  page: number
  size: number
  total: number
  pending: boolean
  onChange: (page: number) => void
}) {
  return (
    <footer class="admin-pagination">
      <span>共 {props.total} 条</span>
      <span>
        第 {props.page} / {Math.max(1, Math.ceil(props.total / props.size))} 页
      </span>
      <ToolButton
        label="上一页"
        icon="chevron-left"
        disabled={props.pending || props.page <= 1}
        onClick={() => props.onChange(props.page - 1)}
      />
      <ToolButton
        label="下一页"
        icon="chevron-right"
        disabled={props.pending || props.page * props.size >= props.total}
        onClick={() => props.onChange(props.page + 1)}
      />
    </footer>
  )
}

export function formatAdminTime(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "--"
}
