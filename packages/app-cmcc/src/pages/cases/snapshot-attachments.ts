import type { DockApiCaseSnapshot } from "@/context/dockapi"

// Keep cached snapshots ticket-free; only copy branches whose attachment URLs need resolving.
export function resolveCaseSnapshotAttachments(snapshot: DockApiCaseSnapshot, previewBaseUrl: string) {
  const base = previewBaseUrl.replace(/\/$/, "")
  const sessions = mapChanged(snapshot.sessions, (session) => {
    const messages = mapChanged(session.messages, (message) => {
      const parts = mapChanged(message.parts, (part) => {
        if (part.type !== "tool" || part.state.status !== "completed" || !part.state.attachments) return part
        const attachments = mapChanged(part.state.attachments, (file) => {
          if (
            !/^case:\/\/attachments\/[A-Za-z0-9_-]{1,64}\/[a-f0-9]{64}\.(png|jpg|webp|gif|avif|bmp|pdf)$/.test(file.url)
          )
            return file
          return { ...file, url: `${base}/${file.url.slice("case://".length)}` }
        })
        return attachments === part.state.attachments ? part : { ...part, state: { ...part.state, attachments } }
      })
      return parts === message.parts ? message : { ...message, parts }
    })
    return messages === session.messages ? session : { ...session, messages }
  })
  return sessions === snapshot.sessions ? snapshot : { ...snapshot, sessions }
}

function mapChanged<T>(values: T[], map: (value: T) => T) {
  const result = values.map(map)
  return result.some((value, index) => value !== values[index]) ? result : values
}
