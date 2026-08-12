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
  routes?: readonly ProductRoute[]
  sidebarRail?: Component<{ mobile?: boolean }>
  promptAccessory?: Component<{ controller: ProductPromptController }>
  promptMenu?: Component<{ controller: ProductPromptController }>
  sidebarClass?: string
  promptClass?: string
  hideModelProviders?: boolean
  hideModelVariants?: boolean
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
