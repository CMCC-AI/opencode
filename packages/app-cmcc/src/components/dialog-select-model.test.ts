import { expect, test } from "bun:test"
import { modelSelectorCategory, modelSelectorGroups, modelSelectorItems, modelSelectorKey } from "./model-selector"

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

test("groups model families across providers without replacing their real identities", () => {
  const items = [
    { ...model("gateway", "qwen-test"), provider: { id: "gateway", name: "Company gateway" } },
    { ...model("gateway", "deepseek-test"), provider: { id: "gateway", name: "Company gateway" } },
    { ...model("deepseek", "deepseek-test"), provider: { id: "deepseek", name: "DeepSeek" } },
  ]
  const groups = modelSelectorGroups(items)
  expect(groups.map((group) => [group.id, group.name, group.models.length])).toEqual([
    ["deepseek", "DeepSeek", 2],
    ["qwen", "Qwen", 1],
  ])
  expect(groups[0].models).toEqual([items[1], items[2]])
  expect(groups[1].models[0]).toBe(items[0])
  expect(groups[0].models.map(modelSelectorKey)).toEqual([
    '["gateway","deepseek-test"]',
    '["deepseek","deepseek-test"]',
  ])
})

test("uses Other for unknown models rather than inferring a family from the provider", () => {
  expect(modelSelectorGroups([model("qwen", "example")])[0].name).toBe("其他")
  expect(modelSelectorGroups([])).toEqual([])
})

test("places unknown models after recognized model families", () => {
  expect(
    modelSelectorGroups([model("gateway", "example"), model("alibaba-cn", "qwen3.8-max")]).map((group) => group.id),
  ).toEqual(["qwen", "other"])
})

test("recognizes the configured Qwen, DeepSeek, Kimi and GLM model IDs", () => {
  expect(
    ["qwen3.8-max", "deepseek-v4-pro", "kimi-k2.6", "glm-5.2"].map(
      (id) => modelSelectorCategory(model("alibaba-cn", id)).name,
    ),
  ).toEqual(["Qwen", "DeepSeek", "Kimi", "GLM"])
})

test("uses family metadata first and falls back to names for custom model aliases", () => {
  expect(modelSelectorCategory({ ...model("gateway", "deployment-1"), family: "qwen3", name: "Deployment" }).id).toBe(
    "qwen",
  )
  expect(modelSelectorCategory({ ...model("gateway", "deployment-2"), name: "DeepSeek V4 Pro" }).id).toBe("deepseek")
  expect(modelSelectorCategory(model("gateway", "moonshotai/kimi-k2.5")).id).toBe("kimi")
  expect(modelSelectorCategory({ ...model("gateway", "notqwen"), name: "qwenish" }).id).toBe("other")
})

test("groups only the existing OpenCode free models under Free", () => {
  expect(modelSelectorCategory({ ...model("opencode", "qwen-free"), cost: { input: 0 } }).id).toBe("free")
  expect(modelSelectorCategory(model("opencode", "existing-free-model")).id).toBe("free")
  expect(modelSelectorCategory({ ...model("opencode", "kimi-k2.5"), cost: { input: 1 } }).id).toBe("kimi")
  expect(modelSelectorCategory({ ...model("alibaba-cn", "qwen3.8-max"), cost: { input: 0 } }).id).toBe("qwen")
  expect(modelSelectorCategory(model("gateway", "unknown-model")).id).toBe("other")
})

test("keys distinguish same-ID models on different providers and do not collide on separators", () => {
  expect(modelSelectorKey(model("alibaba-cn", "qwen3.8-max"))).not.toBe(
    modelSelectorKey(model("gateway", "qwen3.8-max")),
  )
  expect(modelSelectorKey(model("a:b", "c"))).not.toBe(modelSelectorKey(model("a", "b:c")))
})

test("retains provider-scoped selection and model visibility filtering", () => {
  const items = [model("alibaba-cn", "qwen3.8-max"), model("gateway", "qwen3.8-max")]
  expect(modelSelectorItems({ items, visible: () => true, provider: "gateway" })).toEqual([items[1]])
})
