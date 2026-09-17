import { uuid } from "./uuid"

// A single-use route handoff, not a reusable snapshot cache.
export function createCaseHandoff<T>(now = Date.now) {
  let entry: { key: string; scope: number; token: string; value: T; expiresAt: number } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const clear = (token?: string) => {
    if (token && token !== entry?.token) return
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    entry = undefined
  }

  return {
    stage(key: string, scope: number, value: T) {
      clear()
      const token = uuid()
      entry = { key, scope, token, value, expiresAt: now() + 30_000 }
      timer = setTimeout(() => clear(token), 30_000)
      return token
    },
    take(key: string, scope: number, token: unknown) {
      if (!entry || typeof token !== "string" || token !== entry.token) return undefined
      const current = entry
      clear()
      if (current.key !== key || current.scope !== scope || current.expiresAt <= now()) return undefined
      return current.value
    },
    clear,
  }
}
