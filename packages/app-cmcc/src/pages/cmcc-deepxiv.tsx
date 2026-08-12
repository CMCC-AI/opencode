import { CmccSidebarRail } from "@cmcc/components/sidebar-rail"
import { useLocation } from "@solidjs/router"
import { createEffect, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"

const DEEPXIV_URL = import.meta.env.VITE_DEEPXIV_URL?.trim()
  || `${window.location.protocol}//${window.location.hostname}:${import.meta.env.VITE_DEEPXIV_PROXY_PORT?.trim() || "3100"}/`

export function isDeepXivPath(pathname: string) {
  return pathname.replace(/\/+$/, "").toLowerCase() === "/deepxiv"
}

export function CmccDeepXivFrame(props: { active: boolean; sidebar?: JSX.Element }) {
  return (
    <div
      aria-hidden={!props.active}
      inert={!props.active}
      class="absolute inset-0 z-10 flex min-h-0 min-w-0 bg-white"
      classList={{
        "invisible pointer-events-none": !props.active,
        "flex-row": !!props.sidebar,
        "flex-col": !props.sidebar,
      }}
    >
      {props.sidebar}
      <iframe
        title="DeepXiv 前沿论文"
        class="min-h-0 min-w-0 flex-1 border-0 bg-white"
        src={DEEPXIV_URL}
        allow="clipboard-read; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
      />
    </div>
  )
}

export function CmccDeepXivRoute() {
  return null
}

export function CmccDeepXivPersistentView() {
  const location = useLocation()
  const [state, setState] = createStore({ mounted: isDeepXivPath(location.pathname) })

  createEffect(() => {
    if (isDeepXivPath(location.pathname)) setState("mounted", true)
  })

  return (
    <Show when={state.mounted}>
      <CmccDeepXivFrame
        active={isDeepXivPath(location.pathname)}
        sidebar={
          <aside class="w-16 shrink-0 overflow-y-auto border-r border-border-weaker-base bg-background-base px-2 pt-3">
            <CmccSidebarRail />
          </aside>
        }
      />
    </Show>
  )
}
