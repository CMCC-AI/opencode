import { createSimpleContext } from "@opencode-ai/ui/context"
import type { Component, JSX, ParentProps } from "solid-js"

export type ProductRoute = {
  path: string
  component: Component
}

export type ProductPromptController = {
  attach: () => void
  openCommands: () => void
  restoreFocus: () => void
  setText: (value: string) => void
  text: () => string
}

export type ProductExtension = {
  id: string
  name: string
  mark?: Component<{ class?: string }>
  wordmark?: Component<{ class?: string }>
  home?: Component
  layout?: Component<ParentProps>
  agentLabel?: (agent: string) => string | undefined
  routes?: readonly ProductRoute[]
  sidebarRail?: Component<{ mobile?: boolean }>
  promptAccessory?: Component<{ controller: ProductPromptController }>
  promptMenu?: Component<{ controller: ProductPromptController }>
  sidebarClass?: string
  promptClass?: string
  hideModelProviders?: boolean
  hideModelVariants?: boolean
  newSessionHome?: Component<{ children: JSX.Element }>
  promptPlaceholder?: string
  transformTranslation?: (value: string) => string
}

const defaults: ProductExtension = {
  id: "opencode",
  name: "OpenCode",
}

export const { use: useProduct, provider: ProductProvider } = createSimpleContext({
  name: "Product",
  gate: false,
  init: (props: ParentProps<{ value?: ProductExtension }>) => props.value ?? defaults,
})
