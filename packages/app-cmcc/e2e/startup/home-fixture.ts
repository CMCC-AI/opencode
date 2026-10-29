import type { Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

export const homeDirectory = "C:/home-sizing-test"
export const homeSession = {
  id: "ses_home_controls",
  slug: "home-controls",
  projectID: "home-sizing-test",
  directory: homeDirectory,
  title: "输入框回归测试",
  version: "v2",
  agent: "build",
  time: { created: 1, updated: 1 },
}

function provider(id: string, name: string, modelName: string) {
  return {
    id,
    name,
    source: "config",
    env: [],
    options: {},
    models: {
      [id + "-test"]: { id: id + "-test", name: modelName, limit: { context: 200000 }, cost: { input: 0, output: 0 } },
    },
  }
}

export async function setupHomePage(
  page: Page,
  options: { models?: boolean; history?: boolean; free?: boolean; duplicateModels?: boolean; bailian?: boolean } = {},
) {
  await page.addInitScript(() => {
    if (window !== window.top) return
    localStorage.setItem("dockapi.accessToken", "home-sizing-test-token")
    const observer = new MutationObserver(() => {
      const input = document.querySelector('[data-component="session-new-design"] [data-component="prompt-input"]')
      if (!input || !input.getBoundingClientRect().width) return
      requestAnimationFrame(() => performance.mark("home-ready"))
      observer.disconnect()
    })
    observer.observe(document, { childList: true, subtree: true })
  })
  const providers = !options.models
    ? []
    : options.free
      ? [provider("opencode", "OpenCode", "测试免费模型")]
      : [
          provider("alibaba-cn", "Qwen", "Qwen 测试模型"),
          provider("deepseek", "DeepSeek", "DeepSeek 测试模型"),
          provider("custom-gateway", "公司网关", "网关测试模型"),
        ]
  if (options.models && !options.free) {
    providers[0].models["kimi-k2.6"] = {
      id: "kimi-k2.6",
      name: "Kimi 测试模型",
      limit: { context: 200000 },
      cost: { input: 0, output: 0 },
    }
    providers[0].models["glm-5.2"] = {
      id: "glm-5.2",
      name: "GLM 测试模型",
      limit: { context: 200000 },
      cost: { input: 0, output: 0 },
    }
    if (options.duplicateModels)
      providers[2].models["alibaba-cn-test"] = {
        id: "alibaba-cn-test",
        name: "Qwen 测试模型",
        limit: { context: 200000 },
        cost: { input: 0, output: 0 },
      }
  }
  if (options.bailian && options.models && !options.free) {
    providers[0].name = "阿里云百炼"
    providers[0].models["qwen3.7-flash"] = {
      id: "qwen3.7-flash",
      name: "Qwen3.7 Flash",
      limit: { context: 200000 },
      cost: { input: 0, output: 0 },
    }
    const alibaba = provider("alibaba", "Alibaba", "Alibaba 默认测试模型")
    alibaba.models["qwen3.7-flash"] = { ...providers[0].models["qwen3.7-flash"] }
    providers.unshift(alibaba)
    providers.push(provider("opencode", "OpenCode", "测试免费模型"))
  }
  await mockOpenCodeServer(page, {
    directory: homeDirectory,
    project: { id: "home-sizing-test", worktree: homeDirectory, time: { created: 1 } },
    provider: {
      all: providers,
      connected: providers.map((item) => item.id),
      default: Object.fromEntries(providers.map((item) => [item.id, item.id + "-test"])),
    },
    sessions: options.history ? [homeSession] : [],
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/agent?*", (route) =>
    route.fulfill({
      json: [
        {
          name: "build",
          mode: "primary",
          model: options.bailian ? { providerID: "alibaba-cn", modelID: "glm-5.2" } : undefined,
        },
        {
          name: "plan",
          mode: "primary",
          model: options.bailian ? { providerID: "alibaba-cn", modelID: "glm-5.2" } : undefined,
        },
      ],
    }),
  )
  await page.route("**/api/user/profile", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          user: { id: 1, name: "Home sizing test", phone: "test", enabled: true, casePublishAllowed: false },
          workspace: { id: 1, workspaceKey: "home-sizing-test", directoryPath: homeDirectory, status: "READY" },
        },
      },
    }),
  )
  await page.route("**/api/dockapi/sessions", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: options.history
          ? [
              {
                id: "business-home-controls",
                agentType: "general",
                query: homeSession.title,
                title: homeSession.title,
                openCodeSessionId: homeSession.id,
                directoryPath: homeDirectory,
                openCodeSession: homeSession,
                openCodeStatus: { type: "idle" },
                createdAt: "2026-09-22T00:00:00Z",
                updatedAt: "2026-09-22T00:00:00Z",
              },
            ]
          : [],
      },
    }),
  )
  await page.route("**/file/directory*", (route) => route.fulfill({ json: { path: homeDirectory } }))
  await page.route("**/api/reference?*", (route) => route.fulfill({ json: { data: [] } }))
  await page.route("**/experimental/resource?*", (route) => route.fulfill({ json: {} }))
}
