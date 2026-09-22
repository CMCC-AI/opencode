import { Popover } from "@kobalte/core/popover"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tag } from "@opencode-ai/ui/tag"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { For, Show, createMemo, type JSX, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal } from "@/context/local"
import { decode64 } from "@/utils/base64"
import { modelSelectorGroups, modelSelectorItems } from "../model-selector"
import "./home-controls.css"

export function HomeActionsPopover(
  props: ParentProps<{
    open: boolean
    menu: boolean
    content: JSX.Element
    ref: (element: HTMLDivElement) => void
  }>,
) {
  // The composer owns dismissal so the skills panel can keep accepting input from the editor.
  return (
    <Popover
      open={props.open}
      modal={false}
      placement={props.menu ? "top" : "top-start"}
      gutter={8}
      overflowPadding={12}
      fitViewport
    >
      <Popover.Anchor class="flex shrink-0">{props.children}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          ref={props.ref}
          class="home-actions-popover"
          classList={{ "home-actions-popover-menu": props.menu }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <Popover.Title class="sr-only">更多操作</Popover.Title>
          {props.content}
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}

export function HomeModelControl(props: {
  model: ReturnType<typeof useLocal>["model"]
  loading: boolean
  style: JSX.CSSProperties
  onOpen: () => void
  onClose: () => void
}) {
  const local = useLocal()
  const dialog = useDialog()
  const [state, setState] = createStore({ open: false, query: "", focusEditor: false })
  const groups = createMemo(() =>
    modelSelectorGroups(
      modelSelectorItems({
        items: props.model.list(),
        current: props.model.current(),
        visible: (item) => props.model.visible(item),
      }).filter((item) =>
        `${item.provider.name} ${item.name} ${item.id}`
          .toLocaleLowerCase()
          .includes(state.query.trim().toLocaleLowerCase()),
      ),
    ),
  )

  const manage = async () => {
    setState("open", false)
    const { DialogManageModels } = await import("../dialog-manage-models")
    dialog.show(() => <DialogManageModels />)
  }
  const connect = async () => {
    setState("open", false)
    const { DialogSelectProvider } = await import("../dialog-select-provider")
    dialog.show(() => <DialogSelectProvider directory={() => decode64(local.slug())} />)
  }

  return (
    <DropdownMenu
      modal={false}
      placement="bottom-start"
      gutter={8}
      overflowPadding={12}
      open={state.open}
      onOpenChange={(open) => {
        if (open) {
          props.onOpen()
          setState({ query: "", focusEditor: false })
        }
        setState("open", open)
      }}
    >
      <DropdownMenu.Trigger
        type="button"
        class="home-model-trigger"
        data-action="prompt-model"
        aria-label="选择模型"
        disabled={props.loading}
        style={props.style}
        title={props.model.current()?.name ?? "选择模型"}
      >
        <ProviderIcon id={props.model.current()?.provider.id ?? "synthetic"} class="size-4 shrink-0" />
        <span class="min-w-0 truncate">{props.model.current()?.name ?? (props.loading ? "加载中" : "选择模型")}</span>
        <Icon name="chevron-down" class="size-3 shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          class="home-model-menu"
          aria-label="模型提供商"
          onEscapeKeyDown={() => setState("focusEditor", true)}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (state.focusEditor) props.onClose()
          }}
        >
          <div class="home-model-search">
            <Icon name="magnifying-glass" class="size-4 shrink-0" />
            <input
              type="search"
              aria-label="搜索模型"
              placeholder="搜索模型"
              value={state.query}
              onInput={(event) => setState("query", event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") event.stopPropagation()
              }}
            />
          </div>
          <div class="home-model-providers">
            <For each={groups()}>
              {(group) => (
                <DropdownMenu.Sub gutter={6} overflowPadding={12} overlap>
                  <DropdownMenu.SubTrigger
                    class="home-model-provider"
                    data-current={props.model.current()?.provider.id === group.id ? "" : undefined}
                  >
                    <ProviderIcon id={group.id} class="size-[18px] shrink-0" />
                    <span class="min-w-0 flex-1 truncate">{group.name}</span>
                    <Icon name="chevron-right" class="size-3.5 shrink-0" />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent class="home-model-submenu" aria-label={`${group.name}模型`}>
                      <DropdownMenu.RadioGroup
                        value={props.model.current()?.provider.id === group.id ? props.model.current()?.id : ""}
                        onChange={(modelID) => {
                          if (typeof modelID !== "string") return
                          props.model.set({ providerID: group.id, modelID }, { recent: true })
                          setState({ focusEditor: true, open: false })
                        }}
                      >
                        <For each={group.models.toSorted((a, b) => a.name.localeCompare(b.name))}>
                          {(model) => (
                            <DropdownMenu.RadioItem value={model.id} class="home-model-option">
                              <DropdownMenu.ItemLabel class="min-w-0 flex-1 break-words">
                                {model.name}
                              </DropdownMenu.ItemLabel>
                              <Show when={group.id === "opencode" && (!model.cost || model.cost.input === 0)}>
                                <Tag>免费</Tag>
                              </Show>
                              <Show when={model.latest}>
                                <Tag>最新</Tag>
                              </Show>
                              <DropdownMenu.ItemIndicator>
                                <Icon name="check" class="size-4 shrink-0" />
                              </DropdownMenu.ItemIndicator>
                            </DropdownMenu.RadioItem>
                          )}
                        </For>
                      </DropdownMenu.RadioGroup>
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              )}
            </For>
            <Show when={!groups().length}>
              <p class="home-model-empty">暂无可选模型</p>
            </Show>
          </div>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onSelect={() => void manage()}>
            <Icon name="sliders" class="size-4" />
            <DropdownMenu.ItemLabel>管理模型</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => void connect()}>
            <Icon name="plus" class="size-4" />
            <DropdownMenu.ItemLabel>连接提供商</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}

export function HomeAgentControl(props: {
  options: string[]
  current: string
  onSelect: (name: string) => void
  style: JSX.CSSProperties
}) {
  const extras = () => props.options.filter((name) => name !== "build" && name !== "plan")
  return (
    <div class="home-agent-control" role="group" aria-label="执行模式" style={props.style}>
      <For
        each={[
          { id: "build", label: "执行" },
          { id: "plan", label: "计划" },
        ]}
      >
        {(mode) => (
          <button
            type="button"
            disabled={!props.options.includes(mode.id)}
            aria-pressed={props.current === mode.id}
            onClick={() => props.onSelect(mode.id)}
          >
            {mode.label}
          </button>
        )}
      </For>
      <Show when={extras().length}>
        <DropdownMenu modal={false} placement="top-end">
          <DropdownMenu.Trigger
            type="button"
            aria-label="其他 Agent"
            title={extras().includes(props.current) ? props.current : "其他 Agent"}
            aria-pressed={extras().includes(props.current)}
          >
            <Icon name="chevron-down" class="size-3.5" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content>
              <For each={extras()}>
                {(name) => <DropdownMenu.Item onSelect={() => props.onSelect(name)}>{name}</DropdownMenu.Item>}
              </For>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </Show>
    </div>
  )
}
