export type SelectableModel = {
  id: string
  provider: {
    id: string
    name?: string
  }
}

export function modelSelectorGroups<T extends SelectableModel>(items: T[]) {
  const groups = new Map<string, { id: string; name: string; models: T[] }>()
  for (const item of items) {
    const group = groups.get(item.provider.id)
    if (group) {
      group.models.push(item)
      continue
    }
    groups.set(item.provider.id, {
      id: item.provider.id,
      name: item.provider.name || item.provider.id,
      models: [item],
    })
  }
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name))
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
