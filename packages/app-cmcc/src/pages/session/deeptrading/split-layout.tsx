import { createMemo, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"

export const DEEPTRADING_RIGHT_DEFAULT_PERCENT = 45
export const DEEPTRADING_RIGHT_MIN_PERCENT = 35
export const DEEPTRADING_RIGHT_MAX_PERCENT = 60

export function clampDeepTradingRightPercent(value: number) {
  if (!Number.isFinite(value)) return DEEPTRADING_RIGHT_DEFAULT_PERCENT
  return Math.min(DEEPTRADING_RIGHT_MAX_PERCENT, Math.max(DEEPTRADING_RIGHT_MIN_PERCENT, value))
}

export function deepTradingRightPercentAfterDrag(input: {
  startPercent: number
  startX: number
  currentX: number
  containerWidth: number
}) {
  if (input.containerWidth <= 0) return clampDeepTradingRightPercent(input.startPercent)
  const deltaPercent = ((input.currentX - input.startX) / input.containerWidth) * 100
  return clampDeepTradingRightPercent(input.startPercent - deltaPercent)
}

export function DeepTradingSplitLayout(props: { left: JSX.Element; right: JSX.Element }) {
  let container: HTMLDivElement | undefined
  let previousUserSelect = ""
  let previousCursor = ""
  const [layout, setLayout] = persisted(
    Persist.global("deeptrading-panels"),
    createStore({ rightPercent: DEEPTRADING_RIGHT_DEFAULT_PERCENT }),
  )
  const [drag, setDrag] = createStore({
    active: false,
    startX: 0,
    startPercent: DEEPTRADING_RIGHT_DEFAULT_PERCENT,
    containerWidth: 0,
  })
  const rightPercent = createMemo(() => clampDeepTradingRightPercent(layout.rightPercent))

  const stopDrag = () => {
    if (!drag.active) return
    setDrag("active", false)
    document.body.style.userSelect = previousUserSelect
    document.body.style.cursor = previousCursor
    window.removeEventListener("pointermove", moveDrag)
    window.removeEventListener("pointerup", stopDrag)
    window.removeEventListener("pointercancel", stopDrag)
  }

  const moveDrag = (event: PointerEvent) => {
    if (!drag.active) return
    setLayout(
      "rightPercent",
      deepTradingRightPercentAfterDrag({
        startPercent: drag.startPercent,
        startX: drag.startX,
        currentX: event.clientX,
        containerWidth: drag.containerWidth,
      }),
    )
  }

  const startDrag = (event: PointerEvent) => {
    if (event.button !== 0 || !container) return
    const containerWidth = container.getBoundingClientRect().width
    if (containerWidth <= 0) return
    event.preventDefault()
    previousUserSelect = document.body.style.userSelect
    previousCursor = document.body.style.cursor
    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    setDrag({
      active: true,
      startX: event.clientX,
      startPercent: rightPercent(),
      containerWidth,
    })
    window.addEventListener("pointermove", moveDrag)
    window.addEventListener("pointerup", stopDrag)
    window.addEventListener("pointercancel", stopDrag)
  }

  const resizeByKeyboard = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 5 : 1
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      setLayout("rightPercent", clampDeepTradingRightPercent(rightPercent() + step))
    }
    if (event.key === "ArrowRight") {
      event.preventDefault()
      setLayout("rightPercent", clampDeepTradingRightPercent(rightPercent() - step))
    }
  }

  onCleanup(stopDrag)

  return (
    <div ref={container} class="flex size-full min-h-0 overflow-hidden bg-[#f7f8fb]">
      <section class="flex h-full min-w-0 flex-1 flex-col overflow-hidden">{props.left}</section>
      <div
        role="separator"
        aria-label="调整 DeepTrading 左右栏宽度"
        aria-orientation="vertical"
        aria-valuemin={DEEPTRADING_RIGHT_MIN_PERCENT}
        aria-valuemax={DEEPTRADING_RIGHT_MAX_PERCENT}
        aria-valuenow={Math.round(rightPercent())}
        tabIndex={0}
        class="relative z-20 h-full w-1 shrink-0 touch-none cursor-col-resize bg-transparent outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-[#dfe3ea] hover:before:bg-[#8099ce] focus-visible:before:bg-[#6687d6]"
        onPointerDown={startDrag}
        onKeyDown={resizeByKeyboard}
      />
      <aside
        aria-label="DeepTrading 分析结果"
        class="h-full shrink-0 min-w-0 overflow-hidden bg-[#f7f8fb]"
        style={{ width: `${rightPercent()}%` }}
      >
        {props.right}
      </aside>
    </div>
  )
}
