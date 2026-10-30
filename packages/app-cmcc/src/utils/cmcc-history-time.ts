export function cmccHistoryTime(at: number, now = Date.now()) {
  if (!Number.isFinite(at)) return "--"
  const minutes = Math.max(1, Math.floor((now - at) / 60_000))
  if (minutes < 60) return `${minutes} 分`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 时`
  return `${Math.floor(hours / 24)} 天`
}
