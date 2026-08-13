import { createServer, request as httpRequest } from "node:http"
import type { IncomingMessage, Server, ServerResponse } from "node:http"
import { request as httpsRequest } from "node:https"

const DEFAULT_TARGET = "http://81.70.174.140:3000/"
const DEFAULT_HOST = "0.0.0.0"
const DEFAULT_PORT = 3100
const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
] as const

export async function startDeepXivProxy(options?: {
  host?: string
  port?: number
  publicOrigin?: string
  target?: string
  trustForwardedHeaders?: boolean
}): Promise<Server> {
  const host = options?.host ?? (process.env.DEEPXIV_PROXY_HOST?.trim() || DEFAULT_HOST)
  const port = parsePort(
    options?.port ?? process.env.VITE_DEEPXIV_PROXY_PORT ?? process.env.DEEPXIV_PROXY_PORT,
    options?.port === 0,
  )
  const target = parseTarget(options?.target ?? (
    process.env.DEEPLIT_PROXY_TARGET?.trim()
    || DEFAULT_TARGET
  ))
  const publicOrigin = parsePublicOrigin(
    options?.publicOrigin ?? process.env.DEEPLIT_PROXY_PUBLIC_ORIGIN,
  )
  const trustForwardedHeaders = options?.trustForwardedHeaders
    ?? parseBoolean(process.env.DEEPLIT_PROXY_TRUST_FORWARD_HEADERS)

  const server = createServer((incoming, outgoing) => {
    const source = new URL(incoming.url ?? "/", "http://deepxiv-proxy.local")
    source.searchParams.delete("auth_token")
    const destination = new URL(`${source.pathname}${source.search}`, target)
    const forwardedHost = publicOrigin?.host ?? incoming.headers.host ?? `${host}:${port}`
    const forwardedProtocol = publicOrigin?.protocol.slice(0, -1) ?? "http"
    const forwardedFor = buildForwardedFor(incoming, trustForwardedHeaders)
    const requestUpstream = destination.protocol === "https:" ? httpsRequest : httpRequest
    const proxyRequest = requestUpstream(destination, {
      method: incoming.method,
      headers: requestHeaders(incoming, { forwardedFor, forwardedHost, forwardedProtocol }),
    }, (proxyResponse) => {
      proxyResponse.on("error", (error) => failResponse(outgoing, error))
      outgoing.writeHead(
        proxyResponse.statusCode ?? 502,
        proxyResponse.statusMessage,
        responseHeaders(proxyResponse.headers, target, publicOrigin),
      )
      proxyResponse.pipe(outgoing)
      outgoing.on("close", () => {
        if (!outgoing.writableEnded) proxyResponse.destroy()
      })
    })

    proxyRequest.on("error", (error) => failResponse(outgoing, error))
    incoming.on("aborted", () => proxyRequest.destroy())
    incoming.on("error", (error) => proxyRequest.destroy(error))
    outgoing.on("close", () => {
      if (!outgoing.writableEnded) proxyRequest.destroy()
    })
    incoming.pipe(proxyRequest)
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => {
      server.off("error", reject)
      resolve()
    })
  })
  const address = server.address()
  const listeningPort = address && typeof address !== "string" ? address.port : port
  console.info(`[deepxiv-proxy] http://${host}:${listeningPort} -> ${target.origin}`)
  return server
}

function parsePort(value: string | number | undefined, allowZero = false) {
  if (value === undefined || value === "") return DEFAULT_PORT
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < (allowZero ? 0 : 1) || port > 65_535) {
    throw new Error("DEEPXIV_PROXY_PORT must be an integer between 1 and 65535")
  }
  return port
}

function parseTarget(value: string) {
  const target = new URL(value)
  if (
    (target.protocol !== "http:" && target.protocol !== "https:")
    || target.username
    || target.password
    || (target.pathname !== "/" && target.pathname !== "")
    || target.search
    || target.hash
  ) {
    throw new Error("DEEPLIT_PROXY_TARGET must be an http or https origin")
  }
  return target
}

function parsePublicOrigin(value: string | undefined) {
  const configured = value?.trim()
  if (!configured) return
  const origin = new URL(configured)
  if (
    (origin.protocol !== "http:" && origin.protocol !== "https:")
    || origin.username
    || origin.password
    || (origin.pathname !== "/" && origin.pathname !== "")
    || origin.search
    || origin.hash
  ) {
    throw new Error("DEEPLIT_PROXY_PUBLIC_ORIGIN must be an http or https origin")
  }
  if (origin.origin !== configured && origin.origin !== configured.replace(/\/$/, "")) {
    throw new Error("DEEPLIT_PROXY_PUBLIC_ORIGIN must be an http or https origin")
  }
  return origin
}

function parseBoolean(value: string | undefined) {
  const configured = value?.trim()
  if (!configured || configured === "false") return false
  if (configured === "true") return true
  throw new Error("DEEPLIT_PROXY_TRUST_FORWARD_HEADERS must be true or false")
}

function buildForwardedFor(incoming: IncomingMessage, trustForwardedHeaders: boolean) {
  const remoteAddress = incoming.socket.remoteAddress ?? "127.0.0.1"
  if (!trustForwardedHeaders) return remoteAddress
  const forwarded = incoming.headers["x-forwarded-for"]
  const existing = Array.isArray(forwarded) ? forwarded.join(", ") : forwarded?.trim()
  return existing ? `${existing}, ${remoteAddress}` : remoteAddress
}

function requestHeaders(
  incoming: IncomingMessage,
  forwarded: { forwardedFor: string; forwardedHost: string; forwardedProtocol: string },
) {
  const headers = { ...incoming.headers }
  const connection = incoming.headers.connection?.split(",").map((value) => value.trim().toLowerCase()) ?? []
  HOP_BY_HOP_HEADERS.concat(connection).forEach((name) => delete headers[name])
  delete headers.authorization
  return {
    ...headers,
    host: forwarded.forwardedHost,
    "x-forwarded-for": forwarded.forwardedFor,
    "x-forwarded-host": forwarded.forwardedHost,
    "x-forwarded-proto": forwarded.forwardedProtocol,
  }
}

function responseHeaders(headers: IncomingMessage["headers"], target: URL, publicOrigin: URL | undefined) {
  const result = { ...headers }
  const connection = headers.connection?.split(",").map((value) => value.trim().toLowerCase()) ?? []
  HOP_BY_HOP_HEADERS.concat(connection).forEach((name) => delete result[name])
  if (!publicOrigin) return result
  if (typeof result.location === "string") result.location = rewriteURL(result.location, target, publicOrigin)
  if (typeof result.refresh === "string") {
    result.refresh = result.refresh.replace(/^(\s*\d+\s*;\s*url=)(.+)$/i, (_value, prefix, url) =>
      `${prefix}${rewriteURL(url, target, publicOrigin)}`,
    )
  }
  return result
}

function rewriteURL(value: string, target: URL, publicOrigin: URL) {
  if (!URL.canParse(value)) return value
  const url = new URL(value)
  if (url.origin !== target.origin) return value
  return `${publicOrigin.origin}${url.pathname}${url.search}${url.hash}`
}

function failResponse(outgoing: ServerResponse, error: Error) {
  if (outgoing.destroyed) return
  if (outgoing.headersSent) {
    outgoing.destroy(error)
    return
  }
  outgoing.writeHead(502, { "content-type": "text/plain; charset=utf-8" })
  outgoing.end(`DeepXiv proxy request failed: ${error.message}`)
}
