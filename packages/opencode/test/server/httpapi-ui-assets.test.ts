import { describe, expect } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { serveEmbeddedUIEffect } from "../../src/server/shared/ui"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(AppNodeBuilder.build(FSUtil.node), NodeServices.layer))
const icons = fileURLToPath(new URL("../../../app-cmcc/src/assets/general-deepinsight/thinking/", import.meta.url))
const phases = ["生成查询", "网络搜索", "反思评估", "生成大纲", "报告撰写"]

function fixture(files: Record<string, string>) {
  return Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const directory = yield* tmpdirScoped()
    const index = path.join(directory, "index.html")
    yield* fs.writeWithDirs(index, "<!doctype html><title>UI fallback</title>")
    const assets = { "index.html": index, ...files }
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(
          HttpRouter.use((router) =>
            router.add("*", "/*", (request) =>
              serveEmbeddedUIEffect(new URL(request.url, "http://localhost").pathname, fs, assets, {
                method: request.method,
                ifNoneMatch: request.headers["if-none-match"],
              }),
            ),
          ).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        ),
      ),
      (server) => Effect.promise(() => server.dispose()),
    )
    return { fs, server, assets }
  })
}

describe("embedded UI encoded assets", () => {
  for (const phase of phases) {
    it.live(`serves encoded research progress icon: ${phase}`, () =>
      Effect.gen(function* () {
        const key = `assets/${phase}-abcdefgh.png`
        const file = path.join(icons, `${phase}.png`)
        const { fs, server } = yield* fixture({ [key]: file })
        const request = new Request(`http://localhost/${encodeURI(key)}`)
        const response = yield* Effect.promise(() => server.handler(request))
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toContain("image/png")
        expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
        const bytes = yield* Effect.promise(() => response.arrayBuffer())
        expect(Array.from(new Uint8Array(bytes))).toEqual(Array.from(yield* fs.readFile(file)))
        const etag = response.headers.get("etag")!
        const cached = yield* Effect.promise(() =>
          server.handler(new Request(request, { headers: { "if-none-match": etag } })),
        )
        expect(cached.status).toBe(304)
        expect(cached.headers.get("etag")).toBe(etag)
      }),
    )
  }

  it.live("decodes spaces, plus signs and literal percent sequences exactly once", () =>
    Effect.gen(function* () {
      const key = "assets/图标 100% + literal%20name-abcdefgh.png"
      const file = path.join(icons, "生成查询.png")
      const { fs, server } = yield* fixture({ [key]: file })
      const response = yield* Effect.promise(() => server.handler(new Request(`http://localhost/${encodeURI(key)}`)))
      expect(response.headers.get("content-type")).toContain("image/png")
      expect(Array.from(new Uint8Array(yield* Effect.promise(() => response.arrayBuffer())))).toEqual(
        Array.from(yield* fs.readFile(file)),
      )
    }),
  )

  it.live("rejects malformed escapes without throwing or returning the HTML fallback", () =>
    Effect.gen(function* () {
      const { fs, server, assets } = yield* fixture({})
      for (const suffix of ["%", "%ZZ", "%E7%94"]) {
        const direct = yield* serveEmbeddedUIEffect(`/assets/${suffix}.png`, fs, assets).pipe(
          Effect.map(HttpServerResponse.toWeb),
        )
        expect(direct.status).toBe(404)
        expect(direct.headers.get("content-type")).toContain("application/json")
        const response = yield* Effect.promise(() =>
          server.handler(new Request(`http://localhost/assets/${suffix}.png`)),
        )
        expect(response.status).toBe(404)
        expect(response.headers.get("content-type")?.includes("text/html")).not.toBe(true)
      }
    }),
  )

  it.live("keeps SPA fallback and never resolves decoded paths outside the embedded manifest", () =>
    Effect.gen(function* () {
      const { server } = yield* fixture({})
      for (const route of [
        "/general-deepinsight/session/example",
        "/assets/%2e%2e%2fprivate.png",
        "/assets/%252e%252e%252fprivate.png",
      ]) {
        const response = yield* Effect.promise(() => server.handler(new Request(`http://localhost${route}`)))
        expect(response.status).toBe(200)
        expect(yield* Effect.promise(() => response.text())).toBe("<!doctype html><title>UI fallback</title>")
      }
    }),
  )
})
