export const CMCC_BAILIAN_PROVIDERS = ["alibaba-cn", "alibaba"]

export const CMCC_DEFAULT_MODEL_IDS = [
  "qwen3.8-max",
  "qwen3.7-plus",
  "qwen3.7-flash",
  "qwen3.6-plus",
  "qwen3-coder-plus",
  "qwen3-coder-flash",
  "kimi-k2.6",
  "kimi-k2.5",
  "kimi-k2-thinking",
  "deepseek-v4-pro",
]

const CMCC_MODEL_ALLOWLIST = new Set(["glm-5.2", ...CMCC_DEFAULT_MODEL_IDS].map((id) => id.toLowerCase()))

export function isCmccWhitelistedModel(model: { id?: string; modelID?: string }) {
  const id = model.id ?? model.modelID
  return !!id && CMCC_MODEL_ALLOWLIST.has(id.toLowerCase())
}
