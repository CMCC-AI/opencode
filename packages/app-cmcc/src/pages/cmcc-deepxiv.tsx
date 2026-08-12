const DEEPXIV_URL = import.meta.env.VITE_DEEPXIV_URL?.trim()
  || `${window.location.protocol}//${window.location.hostname}:${import.meta.env.VITE_DEEPXIV_PROXY_PORT?.trim() || "3100"}/`

export function isDeepXivPath(pathname: string) {
  return pathname.replace(/\/+$/, "").toLowerCase() === "/deepxiv"
}

export function CmccDeepXivFrame(props: { active: boolean }) {
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
