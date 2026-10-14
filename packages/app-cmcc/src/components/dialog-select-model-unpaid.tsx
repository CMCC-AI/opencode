import type { Component } from "solid-js"
import type { useLocal } from "@/context/local"
import { DialogSelectModel } from "./dialog-select-model"

type ModelState = ReturnType<typeof useLocal>["model"]

export const DialogSelectModelUnpaid: Component<{ model?: ModelState }> = (props) => (
  <DialogSelectModel model={props.model} />
)
