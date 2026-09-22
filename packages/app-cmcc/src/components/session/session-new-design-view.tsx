import type { JSX } from "solid-js"
import jiutianLogo from "@/assets/home-v6/jiutian-logo.png"
import "./session-new-design-view.css"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  return (
    <div
      data-component="session-new-design"
      class="cmcc-home relative grid size-full min-h-0 min-w-0 justify-items-center overflow-y-auto bg-white"
    >
      <div class="cmcc-home-heading">
        <div class="cmcc-home-brand">
          <img src={jiutianLogo} alt="九天" />
          <h1>DeepInsight深度洞察</h1>
        </div>
        <p>您的智能研究助理，一键式深度研究与自动化科研，赋能AI+产业洞察</p>
      </div>
      <div class="cmcc-home-composer relative z-10 mx-auto">{props.children}</div>
      <div aria-hidden="true" />
    </div>
  )
}
