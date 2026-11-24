import { expect, test } from "bun:test"
import { dockApiServerFetch } from "./dockapi-server-fetch"

test("forwards login credentials but never trusts browser identity/service headers", async () => {
  let sent: RequestInit | undefined
  const send = dockApiServerFetch({
    origin: "http://example.test",
    token: () => "login",
    scope: () => 7,
    refresh: async () => {},
    fetch: (async (_, init) => {
      sent = init
      return new Response()
    }) as typeof fetch,
  })
  await send("http://example.test/session", {
    headers: { "x-opencode-user-id": "99", "x-dockapi-service-token": "forged" },
  })
  const headers = new Headers(sent!.headers)
  expect(headers.get("x-dockapi-authorization")).toBe("Bearer login")
  expect(headers.has("x-opencode-user-id")).toBe(false)
  expect(headers.has("x-dockapi-service-token")).toBe(false)
  expect(sent!.redirect).toBe("error")
})

test("refreshes once and preserves the prompt request body", async () => {
  let token = "old"
  const bodies: string[] = []
  const headers: string[] = []
  const send = dockApiServerFetch({
    origin: "http://example.test",
    token: () => token,
    scope: () => 7,
    refresh: async () => {
      token = "new"
    },
    fetch: (async (input, init) => {
      const request = new Request(input, init)
      bodies.push(await request.text())
      headers.push(request.headers.get("x-dockapi-authorization")!)
      return new Response(null, { status: token === "old" ? 401 : 200 })
    }) as typeof fetch,
  })
  const response = await send(new Request("http://example.test/session", { method: "POST", body: "prompt" }))
  expect(response.status).toBe(200)
  expect(bodies).toEqual(["prompt", "prompt"])
  expect(headers).toEqual(["Bearer old", "Bearer new"])
})

test("does not attach DockAPI credentials to another origin", async () => {
  const send = dockApiServerFetch({
    origin: "http://example.test",
    token: () => "login",
    scope: () => 7,
    refresh: async () => {},
    fetch: (async (_, init) => {
      expect(new Headers(init?.headers).has("x-dockapi-authorization")).toBe(false)
      return new Response()
    }) as typeof fetch,
  })
  await send("https://external.test/file")
})

test("retries an old-token 401 without rotating a token picked up from another tab", async () => {
  let token = "old"
  const send = dockApiServerFetch({
    origin: "http://example.test",
    token: () => token,
    scope: () => 1,
    refresh: async () => { throw new Error("Unexpected refresh") },
    fetch: (async (_, init) => {
      if (new Headers(init?.headers).get("x-dockapi-authorization") === "Bearer old") {
        token = "new"
        return new Response(null, { status: 401 })
      }
      return new Response()
    }) as typeof fetch,
  })
  expect((await send("http://example.test/session")).status).toBe(200)
})

test("rejects a late retry response after a new login session", async () => {
  let token = "old"
  let scope = 1
  const send = dockApiServerFetch({
    origin: "http://example.test",
    token: () => token,
    scope: () => scope,
    refresh: async () => { token = "new" },
    fetch: (async (_input, _init) => {
      if (token === "old") return new Response(null, { status: 401 })
      scope += 1
      return new Response()
    }) as typeof fetch,
  })
  await expect(send("http://example.test/session")).rejects.toThrow("登录状态已变化")
})
