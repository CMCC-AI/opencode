import { Show, splitProps, type ComponentProps } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import sendIcon from "@/assets/chat/send.svg"
import "./send-button.css"

export function PromptSendButton(props: ComponentProps<"button"> & { mode: "send" | "stop" | "shell" }) {
  const [local, rest] = splitProps(props, ["mode", "class", "children"])
  return (
    <button {...rest} class={`cmcc-send-button ${local.class ?? ""}`} data-send-mode={local.mode}>
      <Show
        when={local.mode === "send"}
        fallback={<Icon name={local.mode === "stop" ? "stop" : "arrow-undo-down"} class="size-[18px]" />}
      >
        <img src={sendIcon} alt="" aria-hidden="true" width="18" height="18" />
      </Show>
    </button>
  )
}
