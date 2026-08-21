import { expect, test } from "bun:test"
import { createServer, get, request as httpRequest } from "node:http"
import type { IncomingHttpHeaders } from "node:http"
import { startDeepXivProxy } from "./deepxiv-proxy"

test("forwards requests under the browser-facing host", async () => {
  const observed: Record<string, string | undefined> = {}
  const upstream = createServer((request, response) => {
    observed.authorization = request.headers.authorization
    observed.host = request.headers.host
    observed.proxyAuthorization = request.headers["proxy-authorization"]
    observed.forwardedFor = request.headers["x-forwarded-for"]
    observed.forwardedHost = request.headers["x-forwarded-host"] as string | undefined
    observed.forwardedProto = request.headers["x-forwarded-proto"] as string | undefined
    observed.url = request.url
    response.writeHead(200, {
      "content-type": "application/json",
      "set-cookie": [
        "deeplit_session=test; Path=/; HttpOnly; SameSite=Lax",
        "deeplit_theme=dark; Path=/; SameSite=Lax",
      ],
    })
    response.end(JSON.stringify({ ok: true }))
  })
  await listen(upstream)
  const upstreamAddress = upstream.address()
  if (!upstreamAddress || typeof upstreamAddress === "string") throw new Error("Missing upstream address")

  let proxy: Awaited<ReturnType<typeof startDeepXivProxy>> | undefined

  try {
    proxy = await startDeepXivProxy({
      host: "127.0.0.1",
      port: 0,
      target: `http://127.0.0.1:${upstreamAddress.port}`,
    })
    const proxyAddress = proxy.address()
    if (!proxyAddress || typeof proxyAddress === "string") throw new Error("Missing proxy address")
    const response = await read(`http://127.0.0.1:${proxyAddress.port}/api/auth/me?auth_token=secret&probe=1`, {
      authorization: "Basic opencode-secret",
      "proxy-authorization": "Basic gateway-secret",
    })
    expect(JSON.parse(response.body)).toEqual({ ok: true })
    expect(response.headers["set-cookie"]).toHaveLength(2)
    expect(response.headers["set-cookie"]?.join("; ")).toContain("deeplit_session=test")
    expect(response.headers["set-cookie"]?.join("; ")).toContain("deeplit_theme=dark")
    expect(observed).toEqual({
      authorization: undefined,
      host: `127.0.0.1:${proxyAddress.port}`,
      proxyAuthorization: undefined,
      forwardedFor: "127.0.0.1",
      forwardedHost: `127.0.0.1:${proxyAddress.port}`,
      forwardedProto: "http",
      url: "/api/auth/me?probe=1",
    })
  } finally {
    proxy?.closeAllConnections()
    if (proxy) await close(proxy)
    await close(upstream)
  }
})

test("rewrites upstream absolute redirects to the public origin", async () => {
  let upstreamOrigin = ""
  const upstream = createServer((_request, response) => {
    response.writeHead(307, {
      location: `${upstreamOrigin}/account?from=login`,
      refresh: `0;url=${upstreamOrigin}/account?from=login`,
    })
    response.end()
  })
  await listen(upstream)
  const upstreamAddress = upstream.address()
  if (!upstreamAddress || typeof upstreamAddress === "string") throw new Error("Missing upstream address")
  upstreamOrigin = `http://127.0.0.1:${upstreamAddress.port}`
  let proxy: Awaited<ReturnType<typeof startDeepXivProxy>> | undefined

  try {
    proxy = await startDeepXivProxy({
      host: "127.0.0.1",
      port: 0,
      publicOrigin: "https://papers.example.com",
      target: upstreamOrigin,
    })
    const proxyAddress = proxy.address()
    if (!proxyAddress || typeof proxyAddress === "string") throw new Error("Missing proxy address")
    const response = await read(`http://127.0.0.1:${proxyAddress.port}/start`)
    expect(response.status).toBe(307)
    expect(response.headers.location).toBe("https://papers.example.com/account?from=login")
    expect(response.headers.refresh).toBe("0;url=https://papers.example.com/account?from=login")
  } finally {
    proxy?.closeAllConnections()
    if (proxy) await close(proxy)
    await close(upstream)
  }
})

test("uses the public HTTPS origin and a trusted client address for auth requests", async () => {
  const observed: Record<string, string | undefined> = {}
  const upstream = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      observed.body = Buffer.concat(chunks).toString("utf8")
      observed.forwardedFor = request.headers["x-forwarded-for"]
      observed.forwardedHost = request.headers["x-forwarded-host"] as string | undefined
      observed.forwardedProto = request.headers["x-forwarded-proto"] as string | undefined
      observed.host = request.headers.host
      observed.origin = request.headers.origin
      response.writeHead(401, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: "bad credentials" }))
    })
  })
  await listen(upstream)
  const upstreamAddress = upstream.address()
  if (!upstreamAddress || typeof upstreamAddress === "string") throw new Error("Missing upstream address")
  let proxy: Awaited<ReturnType<typeof startDeepXivProxy>> | undefined

  try {
    proxy = await startDeepXivProxy({
      host: "127.0.0.1",
      port: 0,
      publicOrigin: "https://cmcc.example.com",
      target: `http://127.0.0.1:${upstreamAddress.port}`,
      trustForwardedHeaders: true,
    })
    const proxyAddress = proxy.address()
    if (!proxyAddress || typeof proxyAddress === "string") throw new Error("Missing proxy address")
    const response = await send(`http://127.0.0.1:${proxyAddress.port}/api/auth/login`, {
      body: JSON.stringify({ email: "person@example.com", password: "invalid" }),
      headers: {
        "content-type": "application/json",
        origin: "https://cmcc.example.com",
        "x-forwarded-for": "203.0.113.42",
      },
    })

    expect(response.status).toBe(401)
    expect(observed).toEqual({
      body: JSON.stringify({ email: "person@example.com", password: "invalid" }),
      forwardedFor: "203.0.113.42, 127.0.0.1",
      forwardedHost: "cmcc.example.com",
      forwardedProto: "https",
      host: "cmcc.example.com",
      origin: "https://cmcc.example.com",
    })
  } finally {
    proxy?.closeAllConnections()
    if (proxy) await close(proxy)
    await close(upstream)
  }
})

function listen(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })
}

function close(server: ReturnType<typeof createServer>) {
  if (!server.listening) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function read(url: string, headers?: Record<string, string>) {
  return new Promise<{ body: string; headers: IncomingHttpHeaders; status: number }>((resolve, reject) => {
    const request = get(url, { headers }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.on("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: response.headers,
        status: response.statusCode ?? 0,
      }))
    })
    request.on("error", reject)
  })
}

function send(url: string, options: { body: string; headers: Record<string, string> }) {
  return new Promise<{ body: string; headers: IncomingHttpHeaders; status: number }>((resolve, reject) => {
    const target = new URL(url)
    const request = httpRequest({
      hostname: target.hostname,
      headers: options.headers,
      method: "POST",
      path: `${target.pathname}${target.search}`,
      port: target.port,
    }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.on("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: response.headers,
        status: response.statusCode ?? 0,
      }))
    })
    request.on("error", reject)
    request.end(options.body)
  })
}
