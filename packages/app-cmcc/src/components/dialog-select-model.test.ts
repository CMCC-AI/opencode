import { expect, test } from "bun:test"
import { modelSelectorItems } from "./model-selector"

const model = (providerID: string, modelID: string) => ({
  id: modelID,
  provider: { id: providerID },
})

test("keeps only the CMCC allowlist when configured models are mixed", () => {
  const items = [model("alibaba-cn", "my-configured-model"), model("alibaba-cn", "qwen3.8-max")]

  expect(
    modelSelectorItems({
      items,
      visible: () => true,
    }).map((item) => item.id),
  ).toEqual(["qwen3.8-max"])
})

test("keeps a whitelisted current model even when its saved visibility is hidden", () => {
  const current = model("alibaba-cn", "qwen3.8-max")
  const items = [current]

  expect(
    modelSelectorItems({
      items,
      current,
      visible: () => false,
    }).map((item) => item.id),
  ).toEqual(["qwen3.8-max"])
})

test("does not keep a non-whitelisted current model", () => {
  const current = model("custom", "my-configured-model")

  expect(
    modelSelectorItems({
      items: [current, model("alibaba-cn", "qwen3.8-max")],
      current,
      visible: () => true,
    }).map((item) => item.id),
  ).toEqual(["qwen3.8-max"])
})
