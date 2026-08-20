import { FSUtil } from "@opencode-ai/core/fs-util"
import { Effect, Stream } from "effect"
import { HttpBody, HttpClient, HttpClientRequest, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { createHash } from "node:crypto"
import { ProxyUtil } from "../proxy-util"

let embeddedUIPromise: Promise<Record<string, string> | null> | undefined

type EmbeddedUIAsset = {
  file: string
  body: Uint8Array
  contentType: string
  contentSecurityPolicy?: string
  etag: string
}

const embeddedUIAssetCache = new WeakMap<Record<string, string>, Map<string, EmbeddedUIAsset>>()
const HASHED_ASSET_REGEX = /^assets\/.+-[A-Za-z0-9_-]{8,}\.[^/]+$/

export const UI_UPSTREAM = new URL("https://app.opencode.ai")

const CMCC_EXPERT_FRAME_SOURCES = [
  "http://152.136.106.161:3001",
  "http://81.70.174.140:8082",
  "http://81.70.174.140:8888",
]

export const csp = (hash = "", deepXivOrigin = process.env.DEEPLIT_PROXY_PUBLIC_ORIGIN) => {
  const deepXivFrameSource = parseFrameSource(deepXivOrigin)
  const frameSources = [...CMCC_EXPERT_FRAME_SOURCES, ...(deepXivFrameSource ? [deepXivFrameSource] : [])].join(" ")
  return `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'${hash ? ` 'sha256-${hash}'` : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; frame-src 'self' ${frameSources}; connect-src * data:`
}
export const DEFAULT_CSP = csp()

function parseFrameSource(value: string | undefined) {
  const configured = value?.trim()
  if (!configured || !URL.canParse(configured)) return
  const origin = new URL(configured)
  if (origin.protocol !== "http:" && origin.protocol !== "https:") return
  if (origin.username || origin.password || origin.search || origin.hash) return
  if (origin.pathname !== "/" && origin.pathname !== "") return
  if (origin.origin !== configured && origin.origin !== configured.replace(/\/$/, "")) return
  return origin.origin
}

export function themePreloadHash(body: string) {
  return body.match(/<script\b(?![^>]*\bsrc\s*=)[^>]*\bid=(['"])oc-theme-preload-script\1[^>]*>([\s\S]*?)<\/script>/i)
}

export function cspForHtml(body: string) {
  const match = themePreloadHash(body)
  return csp(match ? createHash("sha256").update(match[2]).digest("base64") : "")
}

function requestBody(request: HttpServerRequest.HttpServerRequest) {
  if (request.method === "GET" || request.method === "HEAD") return HttpBody.empty
  const len = request.headers["content-length"]
  return HttpBody.stream(request.stream, request.headers["content-type"], len === undefined ? undefined : Number(len))
}

function proxyResponseHeaders(headers: Record<string, string>) {
  const result = new Headers(headers)
  // FetchHttpClient exposes decoded response bodies, so forwarding upstream
  // transfer metadata makes browsers decode already-decoded assets again.
  result.delete("content-encoding")
  result.delete("content-length")
  result.delete("transfer-encoding")
  return result
}

export function upstreamURL(path: string) {
  return new URL(path, UI_UPSTREAM).toString()
}

export function embeddedUI(disableEmbeddedWebUi: boolean) {
  if (disableEmbeddedWebUi) return Promise.resolve(null)
  return (embeddedUIPromise ??=
    // @ts-expect-error - generated file at build time
    import("opencode-web-ui.gen.ts").then((module) => module.default as Record<string, string>).catch(() => null))
}

function notFound() {
  return HttpServerResponse.jsonUnsafe({ error: "Not Found" }, { status: 404 })
}

function embeddedUIResponse(key: string, asset: EmbeddedUIAsset, ifNoneMatch?: string) {
  const headers = new Headers({
    "cache-control": asset.contentType.startsWith("text/html")
      ? "no-cache"
      : HASHED_ASSET_REGEX.test(key)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    "content-type": asset.contentType,
    etag: asset.etag,
    vary: "Accept-Encoding",
  })
  if (asset.contentSecurityPolicy) headers.set("content-security-policy", asset.contentSecurityPolicy)

  const etag = asset.etag.replace(/^W\//i, "")
  const notModified = ifNoneMatch
    ?.split(",")
    .some((candidate) => candidate.trim() === "*" || candidate.trim().replace(/^W\//i, "") === etag)
  if (notModified) return HttpServerResponse.empty({ status: 304, headers })
  return HttpServerResponse.raw(asset.body, { headers })
}

export function serveEmbeddedUIEffect(
  requestPath: string,
  fs: FSUtil.Interface,
  embeddedWebUI: Record<string, string>,
  options?: { method?: string; ifNoneMatch?: string },
) {
  const requestedKey = requestPath.replace(/^\//, "")
  const requestedFile = embeddedWebUI[requestedKey]
  const key = requestedFile ? requestedKey : "index.html"
  const file = requestedFile ?? embeddedWebUI[key] ?? null
  if (!file) return Effect.succeed(notFound())

  const cached = embeddedUIAssetCache.get(embeddedWebUI)?.get(key)
  if (cached?.file === file) {
    const ifNoneMatch =
      options?.method === undefined || ["GET", "HEAD"].includes(options.method) ? options?.ifNoneMatch : undefined
    return Effect.succeed(embeddedUIResponse(key, cached, ifNoneMatch))
  }

  return fs.readFile(file).pipe(
    Effect.map((body) => {
      const contentType = FSUtil.mimeType(file)
      const asset = {
        file,
        body,
        contentType,
        contentSecurityPolicy: contentType.startsWith("text/html")
          ? cspForHtml(new TextDecoder().decode(body))
          : undefined,
        etag: `W/"${createHash("sha256").update(body).digest("hex")}"`,
      }
      const cache = embeddedUIAssetCache.get(embeddedWebUI) ?? new Map<string, EmbeddedUIAsset>()
      cache.set(key, asset)
      embeddedUIAssetCache.set(embeddedWebUI, cache)
      const ifNoneMatch =
        options?.method === undefined || ["GET", "HEAD"].includes(options.method) ? options?.ifNoneMatch : undefined
      return embeddedUIResponse(key, asset, ifNoneMatch)
    }),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(notFound())),
  )
}

export function serveUIEffect(
  request: HttpServerRequest.HttpServerRequest,
  services: { fs: FSUtil.Interface; client: HttpClient.HttpClient; disableEmbeddedWebUi: boolean },
) {
  return Effect.gen(function* () {
    const embeddedWebUI = yield* Effect.promise(() => embeddedUI(services.disableEmbeddedWebUi))
    const path = new URL(request.url, "http://localhost").pathname

    if (embeddedWebUI) {
      return yield* serveEmbeddedUIEffect(path, services.fs, embeddedWebUI, {
        method: request.method,
        ifNoneMatch: request.headers["if-none-match"],
      })
    }

    const response = yield* services.client.execute(
      HttpClientRequest.make(request.method)(upstreamURL(path), {
        headers: ProxyUtil.headers(request.headers, { host: UI_UPSTREAM.host }),
        body: requestBody(request),
      }),
    )
    const headers = proxyResponseHeaders(response.headers)

    if (response.headers["content-type"]?.includes("text/html")) {
      const body = yield* response.text
      headers.set("Content-Security-Policy", cspForHtml(body))
      return HttpServerResponse.text(body, { status: response.status, headers })
    }

    headers.set("Content-Security-Policy", csp())
    return HttpServerResponse.stream(response.stream.pipe(Stream.catchCause(() => Stream.empty)), {
      status: response.status,
      headers,
    })
  })
}
