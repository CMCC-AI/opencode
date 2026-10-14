import { describe, expect } from "bun:test"
import { gunzipSync } from "node:zlib"
import path from "node:path"
import { NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { compressionLayer } from "../../src/server/routes/instance/httpapi/middleware/compression"
import { serveEmbeddedUIEffect } from "../../src/server/shared/ui"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(AppNodeBuilder.build(FSUtil.node), NodeServices.layer))
const svg = `<svg xmlns="http://www.w3.org/2000/svg">${'<rect width="10" height="10"/>'.repeat(100)}</svg>`

function app(fs: FSUtil.Interface, assets: Record<string, string>) {
  return HttpRouter.toWebHandler(
    HttpRouter.use((router) =>
      router.add("*", "/*", (request) =>
        serveEmbeddedUIEffect(new URL(request.url, "http://localhost").pathname, fs, assets, {
          method: request.method,
          ifNoneMatch: request.headers["if-none-match"],
        }),
      ),
    ).pipe(Layer.provide([compressionLayer, HttpServer.layerServices])),
    { disableLogger: true },
  )
}

function fixture() {
  return Effect.gen(function* () {
    const tmp = yield* tmpdirScoped()
    const fs = yield* FSUtil.Service
    const file = path.join(tmp, "wiki-abcdefgh.svg")
    yield* fs.writeWithDirs(file, svg)
    const server = yield* Effect.acquireRelease(
      Effect.sync(() => app(fs, { "assets/wiki-abcdefgh.svg": file })),
      (server) => Effect.promise(() => server.dispose()),
    )
    return { fs, tmp, server }
  })
}

describe("embedded UI asset compression", () => {
  it.live("compresses SVG bytes while preserving MIME, cache headers and decoded content", () =>
    Effect.gen(function* () {
      const { server } = yield* fixture()
      const response = yield* Effect.promise(() =>
        server.handler(
          new Request("http://localhost/assets/wiki-abcdefgh.svg", { headers: { "accept-encoding": "gzip" } }),
        ),
      )
      const bytes = new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()))
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("image/svg+xml")
      expect(response.headers.get("content-encoding")).toBe("gzip")
      expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
      expect(response.headers.get("vary")).toContain("Accept-Encoding")
      expect(gunzipSync(bytes).toString()).toBe(svg)
      expect(bytes.length).toBeLessThan(Buffer.byteLength(svg))
    }),
  )

  it.live("retains uncompressed responses for clients without gzip", () =>
    Effect.gen(function* () {
      const { server } = yield* fixture()
      const response = yield* Effect.promise(() =>
        server.handler(new Request("http://localhost/assets/wiki-abcdefgh.svg")),
      )
      expect(response.headers.get("content-encoding")).toBeNull()
      expect(yield* Effect.promise(() => response.text())).toBe(svg)
    }),
  )

  it.live("preserves conditional requests for compressed assets and HEAD responses", () =>
    Effect.gen(function* () {
      const { server } = yield* fixture()
      const first = yield* Effect.promise(() =>
        server.handler(
          new Request("http://localhost/assets/wiki-abcdefgh.svg", { headers: { "accept-encoding": "gzip" } }),
        ),
      )
      const etag = first.headers.get("etag")!
      yield* Effect.promise(() => first.arrayBuffer())
      const response = yield* Effect.promise(() =>
        server.handler(
          new Request("http://localhost/assets/wiki-abcdefgh.svg", {
            headers: { "accept-encoding": "gzip", "if-none-match": etag },
          }),
        ),
      )
      expect(response.status).toBe(304)
      expect(response.headers.get("etag")).toBe(etag)
      expect(response.headers.get("content-encoding")).toBeNull()
      expect(yield* Effect.promise(() => response.text())).toBe("")
      const head = yield* Effect.promise(() =>
        server.handler(
          new Request("http://localhost/assets/wiki-abcdefgh.svg", {
            method: "HEAD",
            headers: { "accept-encoding": "gzip" },
          }),
        ),
      )
      expect(head.status).toBe(200)
      expect(head.headers.get("content-encoding")).toBeNull()
      expect(yield* Effect.promise(() => head.text())).toBe("")
    }),
  )

  it.live("does not recompress binary image assets", () =>
    Effect.gen(function* () {
      const { fs, tmp } = yield* fixture()
      const bytes = new Uint8Array(2048).fill(42)
      const file = path.join(tmp, "image-abcdefgh.png")
      yield* fs.writeWithDirs(file, bytes)
      const server = yield* Effect.acquireRelease(
        Effect.sync(() => app(fs, { "assets/image-abcdefgh.png": file })),
        (server) => Effect.promise(() => server.dispose()),
      )
      const response = yield* Effect.promise(() =>
        server.handler(
          new Request("http://localhost/assets/image-abcdefgh.png", { headers: { "accept-encoding": "gzip" } }),
        ),
      )
      expect(response.headers.get("content-type")).toContain("image/png")
      expect(response.headers.get("content-encoding")).toBeNull()
      expect(new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()))).toEqual(bytes)
    }),
  )
})
