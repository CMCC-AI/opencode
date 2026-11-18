import { createMediaQuery } from "@solid-primitives/media"
import { createEffect, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import "./team-panel.css"

function limits(height: number) {
  return {
    min: Math.min(96, height * 0.4),
    max: height - Math.min(160, height * 0.5),
  }
}

function clampDetails(value: number, height: number) {
  const { min, max } = limits(height)
  return Math.min(max, Math.max(min, value))
}

export function WorkbenchTeamPanel(props: {
  dag: JSX.Element
  progress: JSX.Element
  details: JSX.Element
  stacked?: boolean
  dagMinHeight?: number
}) {
  const desktop = createMediaQuery("(min-width: 768px)")
  const [split, setSplit] = createStore({ available: 0, current: 0, ratio: undefined as number | undefined })
  let panel!: HTMLDivElement
  let drag: { pointer: number; startY: number; startHeight: number } | undefined

  const measure = () => {
    const dagHeight = panel.firstElementChild?.getBoundingClientRect().height ?? 0
    const detailsHeight = panel.lastElementChild?.getBoundingClientRect().height ?? 0
    return { available: Math.round(dagHeight + detailsHeight), current: Math.round(detailsHeight) }
  }

  createEffect(() => {
    if (!desktop()) return
    const update = () => setSplit(measure())
    update()
    const observer = new ResizeObserver(update)
    observer.observe(panel)
    if (panel.firstElementChild) observer.observe(panel.firstElementChild)
    if (panel.lastElementChild) observer.observe(panel.lastElementChild)
    onCleanup(() => {
      drag = undefined
      observer.disconnect()
    })
  })

  const resized = () => desktop() && split.ratio !== undefined && split.available > 0
  const height = () => clampDetails((split.ratio ?? 0) * split.available, split.available)
  const resize = (value: number, available: number) => {
    if (available <= 0) return
    setSplit({ available, ratio: clampDetails(value, available) / available })
  }

  return (
    <div
      ref={panel}
      data-workbench-team-panel
      data-team-panel-sized={resized() ? "" : undefined}
      class="min-h-0 flex-1 overflow-hidden rounded-[8px] border border-[#dfe4ed] bg-white"
      classList={{
        "workbench-team-grid grid": !props.stacked,
        "workbench-team-stack flex flex-col": props.stacked,
      }}
      style={{
        "--workbench-details-height": resized() ? `${height()}px` : undefined,
        "--workbench-dag-min-height": props.dagMinHeight ? `${props.dagMinHeight}px` : undefined,
      }}
    >
      {props.dag}
      {props.progress}
      <div class="relative z-10 hidden h-0 shrink-0 md:block">
        <div
          role="separator"
          aria-label="调整图谱和详情高度"
          aria-orientation="horizontal"
          aria-valuemin={Math.min(Math.round(limits(split.available).min), split.current)}
          aria-valuemax={Math.max(Math.round(limits(split.available).max), split.current)}
          aria-valuenow={split.current}
          aria-valuetext={`详情高度 ${split.current} 像素`}
          tabIndex={0}
          class="group absolute inset-x-0 top-0 flex h-2 -translate-y-1/2 cursor-row-resize items-center justify-center outline-none hover:bg-[#5278c4]/10 focus-visible:bg-[#5278c4]/10"
          onPointerDown={(event) => {
            if (!desktop() || event.button !== 0 || event.pointerType === "touch") return
            event.preventDefault()
            const size = measure()
            setSplit(size)
            drag = { pointer: event.pointerId, startY: event.clientY, startHeight: size.current }
            event.currentTarget.focus({ preventScroll: true })
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (drag?.pointer !== event.pointerId) return
            resize(drag.startHeight + drag.startY - event.clientY, split.available)
          }}
          onLostPointerCapture={() => (drag = undefined)}
          onKeyDown={(event) => {
            const direction = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0
            if (!desktop() || !direction) return
            event.preventDefault()
            const { available, current } = measure()
            resize(current + direction * (event.shiftKey ? 48 : 16), available)
          }}
        >
          <span class="pointer-events-none h-0.5 w-7 rounded-full bg-[#bec9db] group-hover:bg-[#5278c4] group-focus-visible:bg-[#5278c4]" />
        </div>
      </div>
      {props.details}
    </div>
  )
}
