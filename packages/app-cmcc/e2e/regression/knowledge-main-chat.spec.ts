import { expect, test, type Locator } from "@playwright/test"
import { fixture } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"

const notebook = {
  id: "knowledge-main-test",
  name: "测试知识库",
  emoji: "📚",
  description: "",
  directory: "C:/OpenCode/Documents/DeepInsight/Knowledge/test",
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: 1,
  sourceCount: 2,
}

test("keeps action panels below the composer and shares main-chat history with the notebook", async ({ page }) => {
  const requests: { messageID: string; system?: string; parts: { id: string; type: string; text?: string }[] }[] = []
  const sessions = [
    {
      ...fixture.sessions[0],
      id: "ses_knowledge_main",
      directory: notebook.directory,
      title: "知识库问答测试",
      metadata: {},
    },
  ]
  await mockOpenCodeServer(page, {
    directory: fixture.directory,
    project: fixture.project,
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: { "deepseek-v4-pro": { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", limit: { context: 200000 } } },
        },
      ],
      connected: ["opencode"],
      default: { opencode: "deepseek-v4-pro" },
    },
    sessions: [],
    pageMessages: () => ({
      items: requests.map((request, index) => ({
        info: {
          id: request.messageID,
          sessionID: "ses_knowledge_main",
          role: "user",
          agent: "build",
          model: { providerID: "opencode", modelID: "deepseek-v4-pro" },
          time: { created: 1700000000000 + index },
        },
        parts: request.parts.map((part) => ({
          ...part,
          sessionID: "ses_knowledge_main",
          messageID: request.messageID,
        })),
      })),
    }),
  })
  await page.route(/\/session(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") {
      sessions[0].metadata = route.request().postDataJSON().metadata
      expect(
        decodeURIComponent(
          route.request().headers()["x-opencode-directory"] ??
            new URL(route.request().url()).searchParams.get("directory") ??
            "",
        ),
      ).toBe(notebook.directory)
      return route.fulfill({ json: sessions[0] })
    }
    return route.fulfill({ json: Object.keys(sessions[0].metadata).length ? sessions : [] })
  })
  await page.route(/\/session\/ses_knowledge_main(?:\?.*)?$/, (route) =>
    route.request().isNavigationRequest() ? route.fallback() : route.fulfill({ json: sessions[0] }),
  )
  await page.route(/\/session\/ses_knowledge_main\/prompt_async(?:\?.*)?$/, (route) => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ status: 204 })
  })
  await page.route("**/file?*", (route) => route.fulfill({ json: [] }))
  await page.route("**/file/knowledge-graph?*", (route) => route.fulfill({ json: { nodes: [], edges: [] } }))
  await page.addInitScript((notebook) => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
    localStorage.setItem("opencode.cmcc.knowledge.notebooks.v1", JSON.stringify([notebook]))
  }, notebook)

  await page.goto("/new-session")
  await page.getByRole("button", { name: "新对话", exact: true }).first().click()
  await expect(page).toHaveURL(/draftId=/)
  const input = page.locator('[data-component="prompt-input"][contenteditable="true"]')
  await expect(input).toBeVisible()
  await page.getByRole("button", { name: "打开更多操作" }).click()
  await expectBelowComposer(page.locator('[data-component="cmcc-prompt-action-menu"]'))
  await page.getByRole("button", { name: "专业数据库", exact: true }).click()
  const database = page.getByRole("dialog", { name: "专业数据库", exact: true })
  await expectBelowComposer(database, true)
  await page.getByRole("button", { name: "关闭专业数据库" }).click()
  await page.getByRole("button", { name: "打开更多操作" }).click()
  await page.getByRole("button", { name: "技能", exact: true }).click()
  await expectBelowComposer(page.getByRole("dialog", { name: "技能", exact: true }), true)
  await expect(page.locator('[data-component="cmcc-prompt-action-menu"]')).toHaveCount(0)
  await page.getByRole("button", { name: "关闭技能" }).click()
  await input.fill("请根据知识库解释测试内容")
  await page.getByRole("button", { name: "打开更多操作" }).click()
  await page.getByRole("button", { name: "知识库", exact: true }).click()
  const picker = page.getByRole("dialog", { name: "选择知识库" })
  await expect(picker).toBeVisible()
  await expectBelowComposer(picker, true)
  const viewport = page.viewportSize()!
  await page.getByRole("button", { name: "隐藏左栏" }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "打开更多操作" }).click()
  await expectBelowComposer(page.locator('[data-component="cmcc-prompt-action-menu"]'))
  await page.getByRole("button", { name: "知识库", exact: true }).click()
  await expectBelowComposer(picker, true)
  expect((await picker.boundingBox())!.width).toBeLessThanOrEqual(390)
  await page.setViewportSize(viewport)
  await page.keyboard.press("Escape")
  await expect(picker).toBeHidden()
  await page.getByRole("button", { name: "展开左栏" }).click()
  await page.getByRole("button", { name: "打开更多操作" }).click()
  await page.getByRole("button", { name: "知识库", exact: true }).click()
  await picker.getByRole("button", { name: /测试知识库/ }).click()
  await expect(picker).toBeHidden()
  await expect(page).toHaveURL(/\/new-session/)
  await expect(input).toHaveText("请根据知识库解释测试内容")
  await expect(page.locator('[data-component="knowledge-reference"]')).toContainText(notebook.name)

  await page.reload()
  await expect(page.locator('[data-component="knowledge-reference"]')).toContainText(notebook.name)
  await expect(input).toHaveText("请根据知识库解释测试内容")
  await input.press("Enter")
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0].system).toContain(notebook.directory)
  expect(requests[0].system).toContain("index.md")
  expect(requests[0].parts).toContainEqual(expect.objectContaining({ type: "text", text: "请根据知识库解释测试内容" }))
  expect(sessions[0].metadata).toMatchObject({ cmccKnowledgeNotebookID: notebook.id, cmccKnowledgeOrigin: "main" })
  await expect(page).toHaveURL(/\/session\/ses_knowledge_main$/)
  await expect(page).not.toHaveURL(/\/knowledge\//)
  await expect(page.getByTitle(`知识库：${notebook.name}`, { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.locator('[data-component="knowledge-reference"]')).toContainText(notebook.name)
  await expect(page.getByText("请根据知识库解释测试内容", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "打开更多操作" }).click()
  await expectBelowComposer(page.locator('[data-component="cmcc-prompt-action-menu"]'))
  await page.getByRole("button", { name: "专业数据库", exact: true }).click()
  await expectBelowComposer(database, true)
  await page.getByRole("button", { name: "关闭专业数据库" }).click()
  await input.fill("继续解释")
  await input.press("Enter")
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1].system).toContain(notebook.directory)

  await page.goto(`/knowledge/${notebook.id}/session/ses_knowledge_main`)
  await expect(page.getByText("请根据知识库解释测试内容", { exact: true })).toBeVisible()
  await expect(page.getByText("继续解释", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: /对话历史 · 1/ })).toBeVisible()
  await expect(page.locator('button[aria-current="page"]').filter({ hasText: "知识库问答测试" })).toBeVisible()
  await page
    .getByRole("complementary", { name: "CMCC conversations" })
    .getByRole("button", { name: /知识库问答测试/ })
    .click()
  await expect(page).toHaveURL(/\/session\/ses_knowledge_main$/)
  await expect(page).not.toHaveURL(/\/knowledge\//)
})

async function expectBelowComposer(panel: Locator, fullWidth = false) {
  await expect(panel).toBeVisible()
  await expect
    .poll(() =>
      panel.evaluate((element) => {
        const composer = document
          .querySelector('[data-component="session-new-composer"], [data-component="session-composer"]')!
          .getBoundingClientRect()
        const bounds = element.getBoundingClientRect()
        return {
          gap: Math.round(bounds.top - composer.bottom),
          left: Math.round(bounds.left - composer.left),
        }
      }),
    )
    .toEqual({ gap: 8, left: 0 })
  if (fullWidth) {
    expect(
      await panel.evaluate((element) =>
        Math.round(
          element.getBoundingClientRect().width -
            document
              .querySelector('[data-component="session-new-composer"], [data-component="session-composer"]')!
              .getBoundingClientRect().width,
        ),
      ),
    ).toBe(0)
  }
}
