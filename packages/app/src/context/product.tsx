import { createSimpleContext } from "@opencode-ai/ui/context"
import type { Session } from "@opencode-ai/sdk/v2/client"
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

export type ProductSessionAdapter = {
  directory: () => string | undefined
  managesDirectory: (directory: string) => boolean
  owns: (sessionID: string) => boolean
  create?: (input: {
    directory: string
    query: string
    title?: string
    agent: string
    model: { providerID: string; modelID: string }
    variant?: string
  }) => Promise<Session>
  list?: (input: {
    directory: string
    load: (sessionID: string, directory: string) => Promise<Session>
  }) => Promise<Session[] | undefined>
  resolve?: (input: {
    sessionID: string
    load: (sessionID: string, directory: string) => Promise<Session>
  }) => Promise<Session | undefined>
  rename?: (sessionID: string, title: string) => Promise<void>
  remove?: (sessionID: string) => Promise<void>
  canArchive?: (sessionID: string) => boolean
  eventDirectory?: () => string | undefined
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
  session?: () => ProductSessionAdapter
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

export const useProductSession = () => useProduct().session?.()
