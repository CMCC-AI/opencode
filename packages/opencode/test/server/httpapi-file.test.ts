import { afterEach, describe, expect, test } from "bun:test"
import { Context, Effect } from "effect"
import path from "path"
import { symlink } from "node:fs/promises"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { FilePaths } from "../../src/server/routes/instance/httpapi/groups/file"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import { pollWithTimeout } from "../lib/effect"

const context = Context.empty() as Context.Context<unknown>

function request(route: string, directory: string, query?: Record<string, string>, init?: RequestInit) {
  const url = new URL(`http://localhost${route}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value)
  }
  const headers = new Headers(init?.headers)
  headers.set("x-opencode-directory", directory)
  return HttpApiApp.webHandler().handler(
    new Request(url, {
      ...init,
      headers,
    }),
    context,
  )
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("file HttpApi", () => {
  test("serves read endpoints", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "hello.txt"), "hello")

    const [list, content, status] = await Promise.all([
      request(FilePaths.list, tmp.path, { path: "." }),
      request(FilePaths.content, tmp.path, { path: "hello.txt" }),
      request(FilePaths.status, tmp.path),
    ])

    expect(list.status).toBe(200)
    expect(await list.json()).toContainEqual(
      expect.objectContaining({ name: "hello.txt", path: "hello.txt", type: "file" }),
    )

    expect(content.status).toBe(200)
    expect(await content.json()).toMatchObject({ type: "text", content: "hello" })

    expect(status.status).toBe(200)
    expect(await status.json()).toEqual([])
  })

  test("streams PDF previews with byte range and path protection", async () => {
    await using tmp = await tmpdir({ git: true })
    await using outside = await tmpdir({ git: true })
    const pdf = new TextEncoder().encode("%PDF-1.7\npreview-body")
    await Bun.write(path.join(tmp.path, "source.pdf"), pdf)
    await Bun.write(path.join(tmp.path, "source.txt"), pdf)
    await Bun.write(path.join(outside.path, "outside.pdf"), pdf)
    await symlink(path.join(outside.path, "outside.pdf"), path.join(tmp.path, "linked.pdf"))

    const full = await request(FilePaths.preview, tmp.path, { path: "source.pdf", auth_token: "test-token" })
    expect(full.status).toBe(200)
    expect(full.headers.get("content-type")).toBe("application/pdf")
    expect(full.headers.get("accept-ranges")).toBe("bytes")
    expect(full.headers.get("content-length")).toBe(pdf.byteLength.toString())
    expect(full.headers.get("etag")).toMatch(/^W\/"[0-9a-f]+-[0-9a-f]+"$/)
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(pdf)

    const partial = await request(
      FilePaths.preview,
      tmp.path,
      { path: "source.pdf" },
      { headers: { Range: "bytes=5-9" } },
    )
    expect(partial.status).toBe(206)
    expect(partial.headers.get("content-range")).toBe(`bytes 5-9/${pdf.byteLength}`)
    expect(partial.headers.get("content-length")).toBe("5")
    expect(new TextDecoder().decode(await partial.arrayBuffer())).toBe("1.7\np")

    const staleRange = await request(
      FilePaths.preview,
      tmp.path,
      { path: "source.pdf" },
      { headers: { Range: "bytes=5-9", "If-Range": 'W/"stale"' } },
    )
    expect(staleRange.status).toBe(200)
    expect(new Uint8Array(await staleRange.arrayBuffer())).toEqual(pdf)

    const suffix = await request(
      FilePaths.preview,
      tmp.path,
      { path: "source.pdf" },
      { headers: { Range: "bytes=-4" } },
    )
    expect(suffix.status).toBe(206)
    expect(new TextDecoder().decode(await suffix.arrayBuffer())).toBe("body")

    const unsatisfiable = await request(
      FilePaths.preview,
      tmp.path,
      { path: "source.pdf" },
      { headers: { Range: `bytes=${pdf.byteLength}-` } },
    )
    expect(unsatisfiable.status).toBe(416)
    expect(unsatisfiable.headers.get("content-range")).toBe(`bytes */${pdf.byteLength}`)

    expect((await request(FilePaths.preview, tmp.path, { path: "source.txt" })).status).toBe(400)
    expect((await request(FilePaths.preview, tmp.path, { path: "../outside.pdf" })).status).toBe(400)
    expect((await request(FilePaths.preview, tmp.path, { path: "linked.pdf" })).status).toBe(400)
  })

  test("serves search endpoints", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "hello.txt"), "needle")

    const [text, symbols] = await Promise.all([
      request(FilePaths.findText, tmp.path, { pattern: "needle" }),
      request(FilePaths.findSymbol, tmp.path, { query: "hello" }),
    ])
    const files = await Effect.runPromise(
      pollWithTimeout(
        Effect.promise(async () => {
          const response = await request(FilePaths.findFile, tmp.path, { query: "hello", type: "file" })
          const body = await response.json()
          return body.includes("hello.txt") ? { response, body } : undefined
        }),
        "file search index was not ready",
      ),
    )

    expect(text.status).toBe(200)
    expect(await text.json()).toContainEqual(expect.objectContaining({ line_number: 1 }))

    expect(files.response.status).toBe(200)
    expect(files.body).toContain("hello.txt")

    expect(symbols.status).toBe(200)
    expect(await symbols.json()).toEqual([])
  })

  test("builds a knowledge graph on the server", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "02_LLM_Wiki", "source.md"), "[[Target Alias]]")
    await Bun.write(path.join(tmp.path, "02_LLM_Wiki", "target.md"), "---\naliases: [Target Alias]\n---\n# Target")

    const response = await request(FilePaths.knowledgeGraph, tmp.path)
    const graph = await response.json()

    expect(response.status).toBe(200)
    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges).toEqual([
      expect.objectContaining({
        source: "02_LLM_Wiki/source.md",
        target: "02_LLM_Wiki/target.md",
      }),
    ])
  })

  test("uploads a binary file without allowing traversal or overwrite", async () => {
    await using tmp = await tmpdir({ git: true })
    const content = new Uint8Array([0, 1, 2, 255])
    const upload = (file: string) =>
      request(FilePaths.upload, tmp.path, undefined, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: file, content: Buffer.from(content).toString("base64"), encoding: "base64" }),
      })

    const response = await upload("01_Raw_Sources/source.docx")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ path: "01_Raw_Sources/source.docx" })
    expect(new Uint8Array(await Bun.file(path.join(tmp.path, "01_Raw_Sources", "source.docx")).arrayBuffer())).toEqual(
      content,
    )
    expect((await upload("01_Raw_Sources/source.docx")).status).toBe(400)
    expect((await upload("../escape.docx")).status).toBe(400)
  })

  test("deletes files and directories without escaping or deleting the workspace root", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "source.docx"), "source")
    await Bun.write(path.join(tmp.path, "notebook", "nested", "page.md"), "page")
    const remove = (target: string, recursive?: boolean) =>
      request(FilePaths.remove, tmp.path, undefined, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: target, ...(recursive === undefined ? {} : { recursive }) }),
      })

    const file = await remove("source.docx")
    expect(file.status).toBe(200)
    expect(await file.json()).toEqual({ path: "source.docx" })
    expect(await Bun.file(path.join(tmp.path, "source.docx")).exists()).toBe(false)

    expect((await remove("notebook")).status).toBe(400)
    expect(await Bun.file(path.join(tmp.path, "notebook", "nested", "page.md")).exists()).toBe(true)

    const directory = await remove("notebook", true)
    expect(directory.status).toBe(200)
    expect(await directory.json()).toEqual({ path: "notebook" })
    expect(await Bun.file(path.join(tmp.path, "notebook")).exists()).toBe(false)

    expect((await remove(".", true)).status).toBe(400)
    expect((await remove("../outside", true)).status).toBe(400)
  })
})
