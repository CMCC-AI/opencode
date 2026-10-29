import { Component } from "solid-js"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { SettingsQuotaV2 } from "./quota"
import "./settings-v2.css"

export const DialogSettings: Component<{
  sessionID?: string
}> = () => (
  <Dialog fit class="token-quota-dialog">
    <DialogHeader closeLabel="关闭">
      <DialogTitle>Token 额度</DialogTitle>
    </DialogHeader>
    <DialogBody>
      <SettingsQuotaV2 />
    </DialogBody>
  </Dialog>
)
