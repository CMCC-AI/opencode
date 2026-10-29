import { onCleanup } from "solid-js"
import { useCommand } from "@/context/command"
import { useDialog } from "@opencode-ai/ui/context/dialog"

export function useSettingsDialog() {
  const dialog = useDialog()
  let run = 0
  let dead = false

  onCleanup(() => {
    dead = true
  })

  return () => {
    const current = ++run
    void import("@/components/settings-v2").then((module) => {
      if (dead || run !== current) return
      void dialog.show(() => <module.DialogSettings />)
    })
  }
}

export function useSettingsCommand() {
  const command = useCommand()
  const show = useSettingsDialog()

  command.register("settings", () => [
    {
      id: "settings.open",
      title: "Token 额度",
      category: "Token 额度",
      keybind: "mod+comma",
      onSelect: show,
    },
  ])

  return show
}
