import { isCmccWhitelistedModel } from "@/context/model-defaults"

export type SelectableModel = {
  id: string
  provider: {
    id: string
  }
}

export function modelSelectorItems<T extends SelectableModel>(input: {
  items: T[]
  visible: (model: { modelID: string; providerID: string }) => boolean
  current?: T
  provider?: string
}) {
  // CMCC intentionally exposes only the shipped model allowlist.
  const candidates = input.items.filter((item) => {
    if (input.provider && item.provider.id !== input.provider) return false
    if (!isCmccWhitelistedModel(item)) return false
    // Keep a whitelisted current model visible even when its saved visibility is hidden.
    if (input.current && item.id === input.current.id && item.provider.id === input.current.provider.id) return true
    return input.visible({ modelID: item.id, providerID: item.provider.id })
  })
  return candidates
}
