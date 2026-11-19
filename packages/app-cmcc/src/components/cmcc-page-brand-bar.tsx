import type { ParentProps } from "solid-js"
import "./cmcc-page-brand-bar.css"

export function CmccPageBrandBar(props: ParentProps) {
  return (
    <div class="cmcc-page-brandbar">
      <img src="/brand/mobileai-horizontal.svg" alt="移动智能 MobileAI" width={88} height={34} />
      {props.children}
    </div>
  )
}
