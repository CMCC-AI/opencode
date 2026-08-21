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
  return input.items.filter((item) => {
    if (input.provider && item.provider.id !== input.provider) return false
    // Keep the active model selectable until the user switches away from it.
    if (input.current && item.id === input.current.id && item.provider.id === input.current.provider.id) return true
    return input.visible({ modelID: item.id, providerID: item.provider.id })
  })
}
