type CachedSnapshot<T> = { version: string; value: T; size: number }

export function createCaseSnapshotCache<T>(capacity = 4, byteBudget = 32 * 1024 * 1024) {
  const entries = new Map<string, CachedSnapshot<T>>()
  const pending = new Map<string, { version: string; task: Promise<T> }>()
  let bytes = 0
  let generation = 0

  const remove = (key: string) => {
    const entry = entries.get(key)
    if (!entry) return
    bytes -= entry.size
    entries.delete(key)
  }

  return {
    load(key: string, version: string, fetcher: () => Promise<{ value: T; size: number }>): Promise<T> {
      if (!version?.trim()) return Promise.reject(new Error("案例缺少快照版本，无法加载"))
      const cached = entries.get(key)
      if (cached?.version === version) {
        entries.delete(key)
        entries.set(key, cached)
        return Promise.resolve(cached.value)
      }
      remove(key)
      const current = pending.get(key)
      if (current?.version === version) return current.task
      const run = generation
      const task = Promise.resolve()
        .then(fetcher)
        .then(({ value, size }) => {
          if (run !== generation || pending.get(key)?.task !== task) {
            throw new Error("案例缓存已失效，请重新打开")
          }
          // Budget is decoded UTF-16 text size, not the compressed response size or exact JS heap usage.
          if (capacity > 0 && Number.isFinite(size) && size >= 0 && size <= byteBudget) {
            remove(key)
            entries.set(key, { version, value, size })
            bytes += size
            while (entries.size > capacity || bytes > byteBudget) remove(entries.keys().next().value!)
          }
          return value
        })
        .finally(() => {
          if (pending.get(key)?.task === task) pending.delete(key)
        })
      pending.set(key, { version, task })
      return task
    },
    clear() {
      generation += 1
      entries.clear()
      pending.clear()
      bytes = 0
    },
  }
}
