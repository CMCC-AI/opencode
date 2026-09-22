import "./app-loading.css"

export function AppLoading() {
  return (
    <div class="app-loading" data-component="app-loading" role="status" aria-label="系统加载中" aria-busy="true">
      <div class="app-loading-scene" aria-hidden="true">
        <div class="app-loading-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}
