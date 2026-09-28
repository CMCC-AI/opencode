import "./app-loading.css"
import logo from "../assets/auth/startup-loading-logo.webp"

export function AppLoading() {
  return (
    <div class="app-loading" data-component="app-loading" role="status" aria-label="系统加载中" aria-busy="true">
      <div class="app-loading-scene" aria-hidden="true">
        <img class="app-loading-logo" src={logo} alt="" />
        <div class="app-loading-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}
