import { createTransition } from "@kobalte/core/primitives/create-transition"
import { createMediaQuery } from "@solid-primitives/media"
import { createEffect, on, onCleanup, onMount, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"

export function createPageMotion(
  route: Accessor<string>,
  element: Accessor<HTMLElement | undefined>,
  slide: Accessor<boolean>,
) {
  const reduced = createMediaQuery("(prefers-reduced-motion: reduce)")
  let animation: Animation | undefined

  // Animate the existing container; route changes must not recreate sessions or embedded apps.
  createEffect(
    on(route, (current, previous) => {
      if (current === previous) return
      animation?.cancel()
      if (reduced()) return
      animation = element()?.animate(
        [
          { opacity: 0.7, transform: slide() ? "translateY(6px)" : "none" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 180, easing: "cubic-bezier(0.2, 0.75, 0.25, 1)" },
      )
      if (animation) animation.id = "cmcc-page-enter"
    }),
  )
  createEffect(() => {
    if (reduced()) animation?.cancel()
  })
  onCleanup(() => animation?.cancel())
}

export function createDialogMotion(onClose: () => void) {
  const [state, setState] = createStore({ open: false, closing: false })
  const overlay = createTransition(() => state.open, {
    transition: { in: { opacity: 1 }, out: { opacity: 0 } },
    duration: 180,
    exitDuration: 140,
    onAfterExit: onClose,
  })
  const content = createTransition(() => state.open, {
    transition: {
      in: { transform: "none" },
      out: { transform: "translateY(8px) scale(0.98)" },
    },
    duration: 180,
    exitDuration: 140,
    easing: "cubic-bezier(0.2, 0.75, 0.25, 1)",
  })
  onMount(() => setState("open", true))
  return {
    overlay: overlay.style,
    content: content.style,
    closing: () => state.closing,
    close: () => {
      if (state.closing) return
      setState({ open: false, closing: true })
    },
  }
}
