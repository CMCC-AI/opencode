type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number }

export function serialDagRows<T>(items: readonly T[], layout: "folded" | "vertical" = "folded"): T[][] {
  if (layout === "vertical") return items.map((item) => [item])
  const split = Math.ceil(items.length / 2)
  return [items.slice(0, split), items.slice(split)].filter((row) => row.length > 0)
}

export function serialDagEdgePath(
  source: Rect,
  target: Rect,
  container: Rect,
  layout: "folded" | "vertical" = "folded",
) {
  if (layout === "vertical") {
    const x = (source.left + source.right) / 2 - container.left
    return `M ${x} ${source.bottom - container.top + 1} V ${target.top - container.top - 5}`
  }
  const sourceY = (source.top + source.bottom) / 2 - container.top
  const targetY = (target.top + target.bottom) / 2 - container.top
  if (Math.abs(sourceY - targetY) < 1) {
    const forward = target.left > source.left
    const from = (forward ? source.right + 1 : source.left - 1) - container.left
    const to = (forward ? target.left - 5 : target.right + 5) - container.left
    return `M ${from} ${sourceY} H ${to}`
  }

  const from = source.right - container.left + 1
  const to = target.right - container.left + 5
  const turn = container.width - 6
  const radius = Math.max(0, Math.min(10, (targetY - sourceY) / 2, turn - Math.max(from, to)))
  return [
    `M ${from} ${sourceY}`,
    `H ${turn - radius}`,
    `Q ${turn} ${sourceY} ${turn} ${sourceY + radius}`,
    `V ${targetY - radius}`,
    `Q ${turn} ${targetY} ${turn - radius} ${targetY}`,
    `H ${to}`,
  ].join(" ")
}
