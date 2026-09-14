export function createCaseListCache<T>(now = Date.now, ttl = 30_000, capacity = 24) {
  const entries = new Map<string, { value: T; expires: number }>()
  const pending = new Map<string, Promise<T>>()
  let generation = 0

  return {
    peek(key: string) {
      const entry = entries.get(key)
      if (!entry) return
      if (entry.expires <= now()) {
        entries.delete(key)
        return
      }
      return entry.value
    },
    load(key: string, fetcher: () => Promise<T>) {
      const current = pending.get(key)
      if (current) return current
      const run = generation
      const task = Promise.resolve()
        .then(fetcher)
        .then((value) => {
          if (run !== generation) throw new Error("案例列表已更新，请重试")
          entries.delete(key)
          entries.set(key, { value, expires: now() + ttl })
          while (entries.size > capacity) entries.delete(entries.keys().next().value!)
          return value
        })
        .finally(() => {
          if (pending.get(key) === task) pending.delete(key)
        })
      pending.set(key, task)
      return task
    },
    clear() {
      generation += 1
      entries.clear()
      pending.clear()
    },
  }
}
