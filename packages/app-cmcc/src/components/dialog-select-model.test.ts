import { expect, test } from "bun:test"
import { modelSelectorItems } from "./model-selector"

const model = (providerID: string, modelID: string) => ({
  id: modelID,
  provider: { id: providerID },
})

test("shows every model enabled by model management", () => {
  const items = [model("alibaba-cn", "my-configured-model"), model("alibaba-cn", "qwen3.8-max")]

  expect(
    modelSelectorItems({
      items,
      visible: () => true,
    }).map((item) => item.id),
  ).toEqual(["my-configured-model", "qwen3.8-max"])
})

test("keeps the current model selectable when it is later hidden", () => {
  const current = model("opencode", "nemotron-free")
  const items = [current]

  expect(
    modelSelectorItems({
      items,
      current,
      visible: () => false,
    }).map((item) => item.id),
  ).toEqual(["nemotron-free"])
})

test("excludes models disabled by model management", () => {
  const visible = model("opencode", "visible-free")
  const hidden = model("opencode", "hidden-free")

  expect(
    modelSelectorItems({
      items: [visible, hidden],
      visible: (item) => item.modelID === visible.id,
    }).map((item) => item.id),
  ).toEqual(["visible-free"])
})
