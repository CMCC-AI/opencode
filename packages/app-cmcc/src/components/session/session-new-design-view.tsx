import type { JSX } from "solid-js"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"
import { DeepInsightBrand } from "@/components/brand"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-transparent">
      <div class="absolute inset-x-0 top-[14%] flex justify-center px-6">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          <DeepInsightBrand class="justify-center" />
          <div class="mt-12">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
