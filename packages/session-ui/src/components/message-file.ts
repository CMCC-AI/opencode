import type { FilePart } from "@opencode-ai/sdk/v2"
import { isAttachmentReference } from "@opencode-ai/core/util/attachment-reference"

export function attached(part: FilePart) {
  return part.url.startsWith("data:") || isAttachmentReference(part.url)
}

export function inline(part: FilePart) {
  if (attached(part)) return false
  return part.source?.text?.start !== undefined && part.source?.text?.end !== undefined
}

export function kind(part: FilePart) {
  return part.mime.startsWith("image/") && !isAttachmentReference(part.url) ? "image" : "file"
}
