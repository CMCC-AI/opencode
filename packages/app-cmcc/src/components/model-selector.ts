export type SelectableModel = {
  id: string
  name?: string
  family?: string
  cost?: { input: number }
  provider: {
    id: string
    name?: string
  }
}

type ModelCategory = { id: string; name: string; icon: string }

const MODEL_CATEGORIES: (ModelCategory & { pattern: RegExp })[] = [
  { id: "qwen", name: "Qwen", icon: "alibaba", pattern: /(?:^|[/:\s])qwen(?:\d|[-_.\s]|$)/i },
  { id: "deepseek", name: "DeepSeek", icon: "deepseek", pattern: /(?:^|[/:\s])deepseek(?:\d|[-_.\s]|$)/i },
  { id: "kimi", name: "Kimi", icon: "moonshotai", pattern: /(?:^|[/:\s])kimi(?:\d|[-_.\s]|$)/i },
  { id: "glm", name: "GLM", icon: "zhipuai", pattern: /(?:^|[/:\s])glm(?:\d|[-_.\s]|$)/i },
]

export function modelSelectorKey(item: SelectableModel) {
  return JSON.stringify([item.provider.id, item.id])
}

export function modelSelectorCategory(item: SelectableModel): ModelCategory {
  // Keep the existing OpenCode free-model rule; other gateways may omit prices.
  if (item.provider.id === "opencode" && (!item.cost || item.cost.input === 0))
    return { id: "free", name: "Free", icon: "opencode" }

  for (const value of [item.family, item.id, item.name]) {
    if (!value) continue
    const category = MODEL_CATEGORIES.find((candidate) => candidate.pattern.test(value))
    if (category) return category
  }
  return { id: "other", name: "其他", icon: "synthetic" }
}

export function modelSelectorGroups<T extends SelectableModel>(items: T[]) {
  const groups = new Map<string, ModelCategory & { models: T[] }>()
  for (const item of items) {
    const category = modelSelectorCategory(item)
    const group = groups.get(category.id)
    if (group) {
      group.models.push(item)
      continue
    }
    groups.set(category.id, {
      id: category.id,
      name: category.name,
      icon: category.icon,
      models: [item],
    })
  }
  return Array.from(groups.values()).sort(
    (a, b) => Number(a.id === "other") - Number(b.id === "other") || a.name.localeCompare(b.name),
  )
}

export function modelSelectorItems<T extends SelectableModel>(input: {
  items: T[]
  visible: (model: { modelID: string; providerID: string }) => boolean
  current?: T
  provider?: string
}) {
  return input.items.filter((item) => {
    if (input.provider && item.provider.id !== input.provider) return false
    if (modelSelectorCategory(item).id === "free") return false
    // Keep the active model selectable until the user switches away from it.
    if (input.current && item.id === input.current.id && item.provider.id === input.current.provider.id) return true
    return input.visible({ modelID: item.id, providerID: item.provider.id })
  })
}
