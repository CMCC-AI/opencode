import { createEffect, onCleanup, onMount } from "solid-js"
import { useDockApi } from "@/context/dockapi"
import { isDeepXivMessage } from "@/utils/deepxiv-sso"

const DEEPXIV_URL = import.meta.env.VITE_DEEPXIV_URL?.trim()
  || `${window.location.protocol}//${window.location.hostname}:${import.meta.env.VITE_DEEPXIV_PROXY_PORT?.trim() || "3100"}/`

export function isDeepXivPath(pathname: string) {
  return pathname.replace(/\/+$/, "").toLowerCase() === "/deepxiv"
}

export function CmccDeepXivFrame(props: { active: boolean }) {
  const dockapi = useDockApi()
  const origin = new URL(DEEPXIV_URL, window.location.href).origin
  let frame: HTMLIFrameElement | undefined
  let pending: string | undefined
  let generation = 0
  const send = (data: object) => frame?.contentWindow?.postMessage(data, origin)
  const initialize = () => {
    generation += 1
    pending = undefined
    send({ type: "deeplit:sso:init" })
  }

  createEffect(() => {
    dockapi.status
    dockapi.user?.id
    initialize()
  })

  onMount(() => {
    const message = async (event: MessageEvent) => {
      if (!isDeepXivMessage(event, origin, frame?.contentWindow)) return
      if (event.data.type === "deeplit:sso:logout-request") {
        await dockapi.auth.logout()
        return
      }
      if (event.data.type !== "deeplit:sso:ready" || dockapi.status !== "authenticated") return
      const requestId = event.data.requestId
      if (typeof requestId !== "string" || !/^[a-f0-9]{64}$/.test(requestId) || pending === requestId) return
      pending = requestId
      const epoch = generation
      const userId = dockapi.user?.id
      try {
        const result = await dockapi.auth.ssoTicket(requestId)
        if (epoch !== generation || pending !== requestId || dockapi.user?.id !== userId
          || dockapi.status !== "authenticated") return
        send({ type: "deeplit:sso:ticket", requestId, ticket: result.ticket })
      } catch {
        if (epoch === generation && pending === requestId) {
          send({ type: "deeplit:sso:error", requestId })
        }
      } finally {
        if (pending === requestId) pending = undefined
      }
    }
    const clear = () => {
      generation += 1
      pending = undefined
      send({ type: "deeplit:sso:logout" })
    }
    window.addEventListener("message", message)
    window.addEventListener("dockapi-auth-cleared", clear)
    onCleanup(() => {
      generation += 1
      window.removeEventListener("message", message)
      window.removeEventListener("dockapi-auth-cleared", clear)
    })
  })

  return (
    <div
      aria-hidden={!props.active}
      inert={!props.active}
      class="absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col bg-white"
      classList={{
        "invisible pointer-events-none": !props.active,
      }}
    >
      <iframe
        ref={frame}
        onLoad={initialize}
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
