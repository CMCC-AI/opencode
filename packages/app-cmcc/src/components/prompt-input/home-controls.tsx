import { Popover } from "@kobalte/core/popover"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tag } from "@opencode-ai/ui/tag"
import { For, Show, createMemo, type JSX, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal } from "@/context/local"
import { modelSelectorCategory, modelSelectorGroups, modelSelectorItems, modelSelectorKey } from "../model-selector"
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
  const [state, setState] = createStore({ open: false, query: "", focusEditor: false })
  const groups = createMemo(() =>
    modelSelectorGroups(
      modelSelectorItems({
        items: props.model.list(),
        current: props.model.current(),
        visible: (item) => props.model.visible(item),
      }).filter((item) =>
        `${modelSelectorCategory(item).name} ${item.provider.name} ${item.name} ${item.id}`
          .toLocaleLowerCase()
          .includes(state.query.trim().toLocaleLowerCase()),
      ),
    ),
  )

  const currentKey = () => {
    const current = props.model.current()
    return current ? modelSelectorKey(current) : ""
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
        <ProviderIcon
          id={props.model.current() ? modelSelectorCategory(props.model.current()!).icon : "synthetic"}
          class="size-4 shrink-0"
        />
        <span class="min-w-0 truncate">{props.model.current()?.name ?? (props.loading ? "加载中" : "选择模型")}</span>
        <Icon name="chevron-down" class="size-3 shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          class="home-model-menu"
          aria-label="选择模型"
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
                    data-current={
                      group.models.some((model) => modelSelectorKey(model) === currentKey()) ? "" : undefined
                    }
                  >
                    <ProviderIcon id={group.icon} class="size-[18px] shrink-0" />
                    <span class="min-w-0 flex-1 truncate">{group.name}</span>
                    <Icon name="chevron-right" class="size-3.5 shrink-0" />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent class="home-model-submenu" aria-label={`${group.name}模型`}>
                      <DropdownMenu.RadioGroup
                        value={currentKey()}
                        onChange={(key) => {
                          const selected = group.models.find((model) => modelSelectorKey(model) === key)
                          if (!selected) return
                          props.model.set({ providerID: selected.provider.id, modelID: selected.id }, { recent: true })
                          setState({ focusEditor: true, open: false })
                        }}
                      >
                        <For each={group.models.toSorted((a, b) => a.name.localeCompare(b.name))}>
                          {(model) => (
                            <DropdownMenu.RadioItem value={modelSelectorKey(model)} class="home-model-option">
                              <DropdownMenu.ItemLabel class="min-w-0 flex-1 break-words">
                                {model.name}
                                <Show when={group.models.some((item) => item !== model && item.name === model.name)}>
                                  <span class="block text-[11px] text-v2-text-text-muted">
                                    {model.provider.name || model.provider.id}
                                  </span>
                                </Show>
                              </DropdownMenu.ItemLabel>
                              <Show when={group.id === "free"}>
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
