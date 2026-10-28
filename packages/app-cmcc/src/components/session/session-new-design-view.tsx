import { children, Show, type JSX } from "solid-js"
import jiutianLogo from "@/assets/home-v6/jiutian-logo.optimized.webp"
import "./session-new-design-view.css"

export function NewSessionComposerLoading() {
  return (
    <div
      role="status"
      aria-label="正在准备对话"
      class="flex h-[200px] w-full flex-col justify-between rounded-[24px] border-2 border-[#5b4fd7]/50 bg-white px-4 py-3 md:h-40"
    >
      <div aria-hidden="true" class="h-3 w-48 max-w-full rounded bg-surface-base" />
      <div aria-hidden="true" class="h-3 w-24 rounded bg-surface-base" />
    </div>
  )
}

export function NewSessionLoading() {
  return (
    <NewSessionDesignView>
      <NewSessionComposerLoading />
    </NewSessionDesignView>
  )
}

export function NewSessionDesignView(props: { children: JSX.Element; footer?: JSX.Element }) {
  const footer = children(() => props.footer)
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
      <Show when={footer()} fallback={<div aria-hidden="true" />}>
        <div class="cmcc-home-footer w-full min-w-0 self-start">{footer()}</div>
      </Show>
    </div>
  )
}
