export function dockApiServerFetch(input: {
  origin: string
  token: () => string | undefined
  scope: () => number
  refresh: () => Promise<void>
  fetch?: typeof fetch
}): typeof fetch {
  const base = input.fetch ?? globalThis.fetch
  const origin = new URL(input.origin).origin
  return (async (resource: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(resource instanceof Request ? resource.url : String(resource), origin)
    if (url.origin !== origin) return base(resource, init)
    const scope = input.scope()
    const token = input.token()
    const backup = resource instanceof Request ? resource.clone() : resource
    const send = async (target: RequestInfo | URL, token: string | undefined) => {
      const headers = new Headers(target instanceof Request ? target.headers : undefined)
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
      headers.delete("x-opencode-user-id")
      headers.delete("x-dockapi-service-token")
      if (token) headers.set("x-dockapi-authorization", `Bearer ${token}`)
      const response = await base(target, { ...init, headers, redirect: "error" })
      if (input.scope() !== scope) throw new Error("登录状态已变化")
      return response
    }
    const response = await send(resource, token)
    if (response.status !== 401 || !input.token()) return response
    if (input.token() === token) await input.refresh()
    if (input.scope() !== scope) throw new Error("登录状态已变化")
    return send(backup, input.token())
  }) as typeof fetch
}
