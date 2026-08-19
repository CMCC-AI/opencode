const DEEPLENS_URL = import.meta.env.VITE_DEEPLENS_URL?.trim() || "http://81.70.174.140:8082/"

export function isDeepLensPath(pathname: string) {
  return pathname.replace(/\/+$/, "").toLowerCase() === "/deeplens"
}

export function CmccDeepLensFrame(props: { active: boolean }) {
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
        title="DeepLens 拍照即懂"
        class="min-h-0 min-w-0 flex-1 border-0 bg-white"
        src={DEEPLENS_URL}
        allow="camera; clipboard-read; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
      />
    </div>
  )
}

export function CmccDeepLensRoute() {
  return null
}
