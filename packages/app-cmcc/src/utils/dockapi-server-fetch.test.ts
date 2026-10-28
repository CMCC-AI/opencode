import { expect, test } from "bun:test"
import { dockApiServerFetch } from "./dockapi-server-fetch"

test("forwards login credentials but never trusts browser identity/service headers", async () => {
  let sent: RequestInit | undefined
  const send = dockApiServerFetch({
    origin: "http://example.test",
    token: () => "login",
    user: () => 7,
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
    user: () => 7,
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
    user: () => 7,
    refresh: async () => {},
    fetch: (async (_, init) => {
      expect(new Headers(init?.headers).has("x-dockapi-authorization")).toBe(false)
      return new Response()
    }) as typeof fetch,
  })
  await send("https://external.test/file")
})
