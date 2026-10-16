import { describe, expect } from "bun:test"
import path from "node:path"
import { symlink } from "node:fs/promises"
import { NodeServices } from "@effect/platform-node"
import { Effect, Exit, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ATTACHMENT_UPLOAD_LIMIT } from "@opencode-ai/core/util/attachment-reference"
import { writeAttachmentUpload } from "../../src/util/attachment-upload"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(AppNodeBuilder.build(FSUtil.node), NodeServices.layer))
const group = "runs/run-1/attachments/upload-00000000-0000-4000-8000-000000000001"
const bytes = (value: string) => new TextEncoder().encode(value)

describe("attachment upload groups", () => {
  it.live("preserves nested paths without overwriting same-name files", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      const fs = yield* FSUtil.Service
      yield* writeAttachmentUpload(fs, directory, `${group}/资料/一/report.docx`, bytes("first"))
      yield* writeAttachmentUpload(fs, directory, `${group}/资料/二/report.docx`, bytes("second"))
      expect(yield* fs.readFileString(path.join(directory, group, "资料/一/report.docx"))).toBe("first")
      expect(yield* fs.readFileString(path.join(directory, group, "资料/二/report.docx"))).toBe("second")
      expect(
        Exit.isFailure(
          yield* writeAttachmentUpload(fs, directory, `${group}/资料/一/report.docx`, bytes("replace")).pipe(
            Effect.exit,
          ),
        ),
      ).toBe(true)
    }),
  )

  it.live("enforces the cumulative 30 MB limit even for concurrent requests", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      const fs = yield* FSUtil.Service
      yield* fs.writeWithDirs(path.join(directory, group, "existing.bin"), new Uint8Array(ATTACHMENT_UPLOAD_LIMIT - 3))
      const results = yield* Effect.all(
        [
          writeAttachmentUpload(fs, directory, `${group}/one.txt`, bytes("aa")).pipe(Effect.exit),
          writeAttachmentUpload(fs, directory, `${group}/two.txt`, bytes("bb")).pipe(Effect.exit),
        ],
        { concurrency: "unbounded" },
      )
      expect(results.filter(Exit.isSuccess)).toHaveLength(1)
      expect(results.filter(Exit.isFailure)).toHaveLength(1)
    }),
  )

  it.live("rejects a single file over 30 MB and escaping paths before writing", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      const fs = yield* FSUtil.Service
      expect(
        Exit.isFailure(
          yield* writeAttachmentUpload(
            fs,
            directory,
            `${group}/large.bin`,
            new Uint8Array(ATTACHMENT_UPLOAD_LIMIT + 1),
          ).pipe(Effect.exit),
        ),
      ).toBe(true)
      expect(
        Exit.isFailure(
          yield* writeAttachmentUpload(fs, directory, `${group}/../escape.txt`, bytes("bad")).pipe(Effect.exit),
        ),
      ).toBe(true)
      expect(yield* fs.existsSafe(path.join(directory, group, "large.bin"))).toBe(false)
    }),
  )

  it.live("rejects linked ancestors instead of writing outside the upload group", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      const outside = yield* tmpdirScoped()
      const fs = yield* FSUtil.Service
      yield* fs.makeDirectory(path.join(directory, group), { recursive: true })
      yield* Effect.tryPromise(() => symlink(outside, path.join(directory, group, "linked"), "junction"))
      const result = yield* writeAttachmentUpload(fs, directory, `${group}/linked/secret.txt`, bytes("bad")).pipe(
        Effect.exit,
      )
      expect(Exit.isFailure(result)).toBe(true)
      expect(yield* fs.existsSafe(path.join(outside, "secret.txt"))).toBe(false)
    }),
  )
})
