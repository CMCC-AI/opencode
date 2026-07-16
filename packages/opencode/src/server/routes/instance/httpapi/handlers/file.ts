import * as InstanceState from "@/effect/instance-state"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js"
import { LocationServiceMap, locationServiceMapLayer } from "@opencode-ai/core/location-services"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath, RelativePath } from "@opencode-ai/core/schema"
import { Effect, Encoding, Layer, Option } from "effect"
import ignore from "ignore"
import { mkdir, rm } from "node:fs/promises"
import { homedir } from "node:os"
import path from "path"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { scanKnowledgeGraph } from "@/knowledge/graph"

const ARCHIVE_FILE_LIMIT = 200
const ARCHIVE_BYTE_LIMIT = 100 * 1024 * 1024
const UPLOAD_BYTE_LIMIT = 25 * 1024 * 1024

export const fileHandlers = HttpApiBuilder.group(InstanceHttpApi, "file", (handlers) =>
  Effect.gen(function* () {
    const ripgrep = yield* Ripgrep.Service
    const locations = yield* LocationServiceMap.Service

    const filesystem = Effect.fnUntraced(function* <A, E, R>(effect: Effect.Effect<A, E, R>) {
      return yield* effect.pipe(
        Effect.provide(
          locations.get(Location.Ref.make({ directory: AbsolutePath.make((yield* InstanceState.context).directory) })),
        ),
      )
    })

    const findText = Effect.fn("FileHttpApi.findText")(function* (ctx: { query: { pattern: string } }) {
      return (yield* ripgrep
        .grep({ cwd: (yield* InstanceState.context).directory, pattern: ctx.query.pattern, limit: 10 })
        .pipe(Effect.orDie)).map((match) => ({
        path: { text: match.entry.path },
        lines: { text: match.text },
        line_number: match.line,
        absolute_offset: match.offset,
        submatches: match.submatches.map((submatch) => ({
          match: { text: submatch.text },
          start: submatch.start,
          end: submatch.end,
        })),
      }))
    })

    const findFile = Effect.fn("FileHttpApi.findFile")(function* (ctx: {
      query: { query: string; dirs?: "true" | "false"; type?: "file" | "directory"; limit?: number }
    }) {
      const directory = (yield* InstanceState.context).directory
      const limit = ctx.query.limit ?? 10
      const type = ctx.query.type ?? (ctx.query.dirs === "false" ? "file" : undefined)
      const started = performance.now()
      const found = yield* filesystem(FileSystem.Service.use((fs) => fs.find({ query: ctx.query.query, limit, type })))
      yield* Effect.logInfo("find file", {
        query: ctx.query.query,
        type,
        directory,
        limit,
        results: found.length,
        duration: Math.round(performance.now() - started),
      })
      return found.map((item) => item.path)
    })

    const findSymbol = Effect.fn("FileHttpApi.findSymbol")(function* () {
      return []
    })

    const list = Effect.fn("FileHttpApi.list")(function* (ctx: { query: { path: string } }) {
      const directory = (yield* InstanceState.context).directory
      return yield* filesystem(
        Effect.gen(function* () {
          const fs = yield* FileSystem.Service
          const raw = yield* FSUtil.Service
          const location = yield* Location.Service
          const ignored = ignore()
          const gitignore = yield* raw
            .readFileString(path.join(location.project.directory, ".gitignore"))
            .pipe(Effect.catch(() => Effect.succeed("")))
          if (gitignore) ignored.add(gitignore)
          const ignorefile = yield* raw
            .readFileString(path.join(location.project.directory, ".ignore"))
            .pipe(Effect.catch(() => Effect.succeed("")))
          if (ignorefile) ignored.add(ignorefile)
          return (yield* fs.list({ path: RelativePath.make(ctx.query.path) })).map((item) => ({
            name: path.basename(item.path),
            path: item.path,
            absolute: path.resolve(location.directory, item.path),
            type: item.type,
            ignored: ignored.ignores(
              path.relative(location.project.directory, path.resolve(location.directory, item.path)) +
                (item.type === "directory" ? "/" : ""),
            ),
          }))
        }),
      )
    })

    const content = Effect.fn("FileHttpApi.content")(function* (ctx: { query: { path: string } }) {
      const directory = (yield* InstanceState.context).directory
      const file = path.resolve(directory, ctx.query.path)
      if (!FSUtil.contains(directory, file)) return yield* Effect.die(new Error("Path escapes the location"))
      if (!(yield* FSUtil.Service.use((fs) => fs.existsSafe(file)))) return { type: "text" as const, content: "" }
      return yield* filesystem(
        FileSystem.Service.use((fs) => fs.read({ path: RelativePath.make(ctx.query.path) })),
      ).pipe(
        Effect.flatMap((item) =>
          Effect.gen(function* () {
            const text = item.content.includes(0)
              ? Option.none<string>()
              : yield* Effect.try({
                  try: () => new TextDecoder("utf-8", { fatal: true }).decode(item.content),
                  catch: (cause) => cause,
                }).pipe(Effect.option)
            return { item, text }
          }),
        ),
        Effect.map(({ item, text }) =>
          Option.isSome(text)
            ? { type: "text" as const, content: text.value.trim() }
            : {
                type: "binary" as const,
                content: Buffer.from(item.content).toString("base64"),
                encoding: "base64" as const,
                mimeType: item.mime,
              },
        ),
      )
    })

    const download = Effect.fn("FileHttpApi.download")(function* (ctx: { query: { path: string } }) {
      const directory = (yield* InstanceState.context).directory
      const target = downloadPath(directory, ctx.query.path)
      if (!target) return yield* new HttpApiError.BadRequest({})
      return yield* filesystem(FileSystem.Service.use((fs) => fs.read({ path: target }))).pipe(
        Effect.map((file) => file.content),
      )
    })

    const archive = Effect.fn("FileHttpApi.archive")(function* (ctx: { payload: { paths: readonly string[] } }) {
      const directory = (yield* InstanceState.context).directory
      if (ctx.payload.paths.length === 0 || ctx.payload.paths.length > ARCHIVE_FILE_LIMIT)
        return yield* new HttpApiError.BadRequest({})
      const targets = ctx.payload.paths.map((value) => downloadPath(directory, value))
      if (targets.some((target) => target === undefined)) return yield* new HttpApiError.BadRequest({})
      const paths = [...new Set(targets.filter((target) => target !== undefined))]

      const files = yield* Effect.forEach(
        paths,
        (target) =>
          filesystem(FileSystem.Service.use((fs) => fs.read({ path: target }))).pipe(
            Effect.map((file) => ({ ...file, path: target.replaceAll("\\", "/") })),
          ),
        { concurrency: 8 },
      )
      if (files.reduce((total, file) => total + file.content.byteLength, 0) > ARCHIVE_BYTE_LIMIT)
        return yield* new HttpApiError.BadRequest({})

      const writer = new ZipWriter(new BlobWriter("application/zip"))
      yield* Effect.forEach(
        files,
        (file) => Effect.promise(() => writer.add(file.path, new BlobReader(new Blob([new Uint8Array(file.content)])))),
        { concurrency: 1, discard: true },
      )
      const blob = yield* Effect.promise(() => writer.close())
      return new Uint8Array(yield* Effect.promise(() => blob.arrayBuffer()))
    })

    const createDirectory = Effect.fn("FileHttpApi.createDirectory")(function* (ctx: { payload: { path: string } }) {
      const root = path.resolve(homedir(), "Documents", "DeepInsight")
      const target = path.resolve(ctx.payload.path)
      const relative = path.relative(root, target)
      if (relative.startsWith("..") || path.isAbsolute(relative)) return yield* new HttpApiError.BadRequest({})
      yield* Effect.tryPromise(() => mkdir(target, { recursive: true })).pipe(
        Effect.mapError(() => new HttpApiError.BadRequest({})),
      )
    })

    const upload = Effect.fn("FileHttpApi.upload")(function* (ctx: {
      payload: { path: RelativePath; content: string; encoding: "base64" }
    }) {
      const directory = (yield* InstanceState.context).directory
      const target = path.resolve(directory, ctx.payload.path)
      if (!FSUtil.contains(directory, target)) return yield* new HttpApiError.BadRequest({})
      const fs = yield* FSUtil.Service
      if (yield* fs.existsSafe(target)) return yield* new HttpApiError.BadRequest({})
      const content = yield* Effect.fromResult(Encoding.decodeBase64(ctx.payload.content)).pipe(
        Effect.mapError(() => new HttpApiError.BadRequest({})),
      )
      if (content.byteLength > UPLOAD_BYTE_LIMIT) return yield* new HttpApiError.BadRequest({})
      yield* fs.writeWithDirs(target, content).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})))
      return { path: RelativePath.make(path.relative(directory, target).replaceAll("\\", "/")) }
    })

    const remove = Effect.fn("FileHttpApi.remove")(function* (ctx: {
      payload: { path: RelativePath; recursive?: boolean }
    }) {
      const directory = (yield* InstanceState.context).directory
      const target = path.resolve(directory, ctx.payload.path)
      if (!FSUtil.contains(directory, target) || target === path.resolve(directory))
        return yield* new HttpApiError.BadRequest({})
      if (!(yield* FSUtil.Service.use((fs) => fs.existsSafe(target)))) return yield* new HttpApiError.BadRequest({})
      yield* Effect.tryPromise(() => rm(target, { recursive: ctx.payload.recursive ?? false })).pipe(
        Effect.mapError(() => new HttpApiError.BadRequest({})),
      )
      return { path: RelativePath.make(path.relative(directory, target).replaceAll("\\", "/")) }
    })

    const knowledgeGraph = Effect.fn("FileHttpApi.knowledgeGraph")(function* () {
      const directory = (yield* InstanceState.context).directory
      return yield* Effect.tryPromise(() => scanKnowledgeGraph(directory)).pipe(Effect.orDie)
    })

    const status = Effect.fn("FileHttpApi.status")(function* () {
      return []
    })

    return handlers
      .handle("findText", findText)
      .handle("findFile", findFile)
      .handle("findSymbol", findSymbol)
      .handle("list", list)
      .handle("content", content)
      .handle("download", download)
      .handle("archive", archive)
      .handle("createDirectory", createDirectory)
      .handle("upload", upload)
      .handle("remove", remove)
      .handle("knowledgeGraph", knowledgeGraph)
      .handle("status", status)
  }),
).pipe(Layer.provide(locationServiceMapLayer))

function downloadPath(directory: string, value: string) {
  const absolute = path.resolve(directory, value)
  if (!FSUtil.contains(directory, absolute)) return
  const relative = path.relative(directory, absolute)
  if (!relative) return
  return RelativePath.make(relative)
}
