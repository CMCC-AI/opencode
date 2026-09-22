import { expect, test } from "bun:test"
import { modelSelectorGroups, modelSelectorItems } from "./model-selector"

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

test("groups by real provider IDs without guessing a brand from model names", () => {
  const items = [
    { ...model("gateway", "qwen-test"), provider: { id: "gateway", name: "Company gateway" } },
    { ...model("gateway", "deepseek-test"), provider: { id: "gateway", name: "Company gateway" } },
    { ...model("deepseek", "deepseek-test"), provider: { id: "deepseek", name: "DeepSeek" } },
  ]
  const groups = modelSelectorGroups(items)
  expect(groups.map((group) => [group.id, group.name, group.models.length])).toEqual([
    ["gateway", "Company gateway", 2],
    ["deepseek", "DeepSeek", 1],
  ])
  expect(groups[1].models[0]).toBe(items[2])
})

test("keeps custom provider IDs as the label when no name is available", () => {
  expect(modelSelectorGroups([model("custom-provider", "example")])[0].name).toBe("custom-provider")
  expect(modelSelectorGroups([])).toEqual([])
})
