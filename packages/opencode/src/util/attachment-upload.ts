import path from "path"
import { Effect } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { KeyedMutex } from "@opencode-ai/core/effect/keyed-mutex"
import { ATTACHMENT_UPLOAD_LIMIT, attachmentUploadGroup } from "@opencode-ai/core/util/attachment-reference"

const uploads = KeyedMutex.makeUnsafe<string>()

export const writeAttachmentUpload = Effect.fn("AttachmentUpload.write")(function* (
  fs: FSUtil.Interface,
  directory: string,
  relative: string,
  content: Uint8Array,
) {
  const group = attachmentUploadGroup(relative)
  if (!group) return yield* Effect.fail(new Error("附件上传目录无效"))
  const root = yield* fs.realPath(directory)
  const target = path.resolve(root, relative)
  const base = path.resolve(root, group)
  return yield* uploads.withLock(process.platform === "win32" ? base.toLowerCase() : base)(
    Effect.gen(function* () {
      if (!FSUtil.contains(root, target) || !FSUtil.contains(base, target))
        return yield* Effect.fail(new Error("附件路径越界"))
      const segments = path.relative(root, path.dirname(target)).split(path.sep)
      let parent = root
      for (const segment of segments) {
        parent = path.join(parent, segment)
        if (!(yield* fs.existsSafe(parent))) continue
        const real = yield* fs.realPath(parent)
        const same = process.platform === "win32" ? real.toLowerCase() === parent.toLowerCase() : real === parent
        if (!same || (yield* fs.stat(parent)).type !== "Directory")
          return yield* Effect.fail(new Error("附件目录不允许符号链接"))
      }
      if (yield* fs.existsSafe(target)) return yield* Effect.fail(new Error("附件已存在，不能覆盖"))
      let total = content.byteLength
      const directories = (yield* fs.existsSafe(base)) ? [base] : []
      while (directories.length) {
        const current = directories.pop()!
        for (const entry of yield* fs.readDirectoryEntries(current)) {
          const filepath = path.join(current, entry.name)
          if (entry.type === "symlink") return yield* Effect.fail(new Error("附件目录不允许符号链接"))
          if (entry.type === "directory") directories.push(filepath)
          if (entry.type === "file") total += Number((yield* fs.stat(filepath)).size)
          if (total > ATTACHMENT_UPLOAD_LIMIT) return yield* Effect.fail(new Error("文件夹内容不能超过 30 MB"))
        }
      }
      if (total > ATTACHMENT_UPLOAD_LIMIT) return yield* Effect.fail(new Error("文件夹内容不能超过 30 MB"))
      yield* fs.makeDirectory(path.dirname(target), { recursive: true })
      yield* Effect.scoped(Effect.gen(function* () {
        const file = yield* fs.open(target, { flag: "wx" })
        yield* file.writeAll(content)
      }))
    }),
  )
})
