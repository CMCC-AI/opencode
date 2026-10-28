export function dockApiServerFetch(input: {
  origin: string
  token: () => string | undefined
  user: () => number | undefined
  refresh: () => Promise<void>
  fetch?: typeof fetch
}): typeof fetch {
  const base = input.fetch ?? globalThis.fetch
  const origin = new URL(input.origin).origin
  return (async (resource: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(resource instanceof Request ? resource.url : String(resource), origin)
    if (url.origin !== origin) return base(resource, init)
    const user = input.user()
    const backup = resource instanceof Request ? resource.clone() : resource
    const send = (target: RequestInfo | URL) => {
      const headers = new Headers(target instanceof Request ? target.headers : undefined)
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
      headers.delete("x-opencode-user-id")
      headers.delete("x-dockapi-service-token")
      if (input.token()) headers.set("x-dockapi-authorization", `Bearer ${input.token()}`)
      return base(target, { ...init, headers, redirect: "error" })
    }
    const response = await send(resource)
    if (input.user() !== user) throw new Error("登录状态已变化")
    if (response.status !== 401 || !input.token()) return response
    await input.refresh()
    if (input.user() !== user) throw new Error("登录状态已变化")
    return send(backup)
  }) as typeof fetch
}
