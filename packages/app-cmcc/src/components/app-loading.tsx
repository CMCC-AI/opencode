import "./app-loading.css"

export function AppLoading() {
  return (
    <div class="app-loading" data-component="app-loading" role="status" aria-label="系统加载中" aria-busy="true">
      <div class="app-loading-scene" aria-hidden="true">
        <img
          class="app-loading-logo"
          src="/brand/startup-loading.svg"
          width="262"
          height="294"
          fetchpriority="high"
          alt=""
        />
        <p class="app-loading-title" aria-label="DeepInsight">
          {[..."DeepInsight"].map((character) => (
            <span>{character}</span>
          ))}
        </p>
        <div class="app-loading-dots">
          <span />
          <span />
          <span />
        </div>
        <p class="app-loading-label" aria-label="系统加载中...">
          {[..."系统加载中", "..."].map((character) => (
            <span>{character}</span>
          ))}
        </p>
      </div>
    </div>
  )
}
