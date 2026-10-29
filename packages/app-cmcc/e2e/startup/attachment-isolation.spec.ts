import { expect, test, type Page } from "@playwright/test"
import type { Session } from "@opencode-ai/sdk/v2"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { setupHomePage, homeDirectory, homeSession } from "./home-fixture"
import { mockOpenCodeServer } from "../utils/mock-server"

test.use({ locale: "zh-CN" })

const sessions: Session[] = [
  {
    ...homeSession,
    id: "ses_drop_research",
    title: "Research upload isolation",
    agent: "deepinsight/deepinsight-team-lead",
  },
  {
    ...homeSession,
    id: "ses_drop_inspection",
    title: "Inspection upload isolation",
    agent: "deepinspect/deepinspect-team-lead",
  },
].map((session) => ({ ...session, metadata: { cmccArtifactDirectory: `${homeDirectory}/runs/${session.id}` } }))
const editor = '[data-component="prompt-input"]:visible'

async function prepare(page: Page, wait?: Promise<void>) {
  await setupHomePage(page, { models: true })
  await mockOpenCodeServer(page, {
    directory: homeDirectory,
    project: { id: homeSession.projectID, worktree: homeDirectory, time: { created: 1 } },
    provider: {
      all: [{ id: "test", name: "Test", models: { test: { id: "test", name: "Test", limit: { context: 200000 } } } }],
      connected: ["test"],
      default: { test: "test" },
    },
    sessions,
    pageMessages: (id) => ({
      items: [
        {
          info: {
            id: `${id}-user`,
            sessionID: id,
            role: "user",
            time: { created: 1 },
            agent: sessions.find((s) => s.id === id)?.agent,
            model: { providerID: "test", modelID: "test" },
          },
          parts: [
            { id: `${id}-text`, sessionID: id, messageID: `${id}-user`, type: "text", text: "Upload isolation test" },
          ],
        },
      ],
    }),
  })
  await page.route("**/api/dockapi/sessions", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: sessions.map((session, index) => ({
          id: `business-${session.id}`,
          agentType: index ? "deepinspect" : "deepinsight",
          title: session.title,
          query: session.title,
          openCodeSessionId: session.id,
          directoryPath: homeDirectory,
          openCodeSession: session,
          openCodeStatus: { type: "idle" },
        })),
      },
    }),
  )
  await page.route("**/file?*", (route) => route.fulfill({ json: [] }))
  const uploads: Array<{ path: string; content: string }> = []
  await page.route("**/file/upload*", async (route) => {
    const body = route.request().postDataJSON()
    uploads.push(body)
    await wait
    await route.fulfill({ json: { path: body.path } })
  })
  const prompts: string[] = []
  await page.route("**/session/*/prompt_async*", (route) => {
    prompts.push(route.request().url())
    return route.fulfill({ status: 204 })
  })
  return { uploads, prompts }
}

async function navigate(page: Page, session: Session) {
  const sidebar = page.locator('aside[aria-label="CMCC conversations"]')
  const show = page.getByRole("button", { name: "展开左栏", exact: true })
  if (await show.isVisible()) await show.click()
  await sidebar.getByRole("button", { name: new RegExp(session.title) }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${session.id}$`))
  await expect(page.locator(editor)).toBeVisible()
}

async function drop(page: Page, count = 7) {
  const data = await page.evaluateHandle((count) => {
    const transfer = new DataTransfer()
    for (let index = 0; index < count; index++)
      transfer.items.add(
        new File([`original-${index}`], `inspection-${index}.docx`, {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      )
    return transfer
  }, count)
  try {
    await page.locator(editor).dispatchEvent("dragover", { dataTransfer: data })
    await page.locator(editor).dispatchEvent("drop", { dataTransfer: data })
  } finally {
    await data.dispose()
  }
}

for (const width of [1440, 390]) {
  test(`research to inspection uploads seven Word files once at ${width}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const data = await prepare(page)
    await page.goto(`/server/${base64Encode(baseURL!)}/session/${sessions[0].id}`)
    await expect(page.locator(editor)).toBeVisible()
    await navigate(page, sessions[1])
    if (width < 760) await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
    await drop(page)
    await expect(page.getByText("inspection-6.docx", { exact: true })).toBeVisible()
    expect(data.uploads).toHaveLength(7)
    expect(data.uploads.every((item) => item.path.startsWith(`runs/${sessions[1].id}/attachments/`))).toBe(true)
    expect(new Set(data.uploads.map((item) => item.path)).size).toBe(7)
    expect(data.uploads.map((item) => Buffer.from(item.content, "base64").toString())).toEqual(
      Array.from({ length: 7 }, (_, index) => `original-${index}`),
    )
    await page.screenshot({ path: info.outputPath("inspection-attachments.png") })
    await navigate(page, sessions[0])
    await expect(page.getByText(/inspection-\d\.docx/)).toHaveCount(0)
    expect(data.uploads).toHaveLength(7)
    expect(data.prompts).toEqual([])
  })
}

test("an upload finishing after navigation stays with its original conversation", async ({ page, baseURL }) => {
  const gate = Promise.withResolvers<void>()
  const data = await prepare(page, gate.promise)
  try {
    await page.goto(`/server/${base64Encode(baseURL!)}/session/${sessions[1].id}`)
    await expect(page.locator(editor)).toBeVisible()
    await drop(page)
    await expect.poll(() => data.uploads.length).toBe(1)
    await navigate(page, sessions[0])
    gate.resolve()
    await expect.poll(() => data.uploads.length).toBe(7)
    await expect(page.getByText(/inspection-\d\.docx/)).toHaveCount(0)
    await navigate(page, sessions[1])
    await expect(page.getByText("inspection-6.docx", { exact: true })).toBeVisible()
    expect(data.uploads.every((item) => item.path.startsWith(`runs/${sessions[1].id}/attachments/`))).toBe(true)
    expect(data.prompts).toEqual([])
  } finally {
    gate.resolve()
  }
})

test("starting an inspection draft after research does not upload into the research directory", async ({
  page,
  baseURL,
}) => {
  const data = await prepare(page)
  await page.goto(`/server/${base64Encode(baseURL!)}/session/${sessions[0].id}`)
  await expect(page.locator(editor)).toBeVisible()
  await page.getByRole("navigation").getByRole("button", { name: "新对话", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(page.locator(editor)).toBeVisible()
  await page.getByRole("button", { name: "打开更多操作", exact: true }).click()
  await page.getByRole("button", { name: "专家团", exact: true }).click()
  await page.getByRole("menuitem", { name: "巡察分析专家团", exact: true }).click()
  await drop(page)
  await expect(page.getByText("inspection-6.docx", { exact: true })).toBeVisible()
  expect(data.uploads).toHaveLength(7)
  const roots = new Set(data.uploads.map((item) => item.path.split("/attachments/")[0]))
  expect(roots.size).toBe(1)
  expect(roots.has(`runs/${sessions[0].id}`)).toBe(false)
  await navigate(page, sessions[0])
  await expect(page.getByText(/inspection-\d\.docx/)).toHaveCount(0)
  expect(data.uploads).toHaveLength(7)
  expect(data.prompts).toEqual([])
})

test("repeated conversation switches do not accumulate upload listeners", async ({ page, baseURL }) => {
  const data = await prepare(page)
  await page.goto(`/server/${base64Encode(baseURL!)}/session/${sessions[0].id}`)
  await expect(page.locator(editor)).toBeVisible()
  for (let index = 0; index < 3; index++) {
    await navigate(page, sessions[1])
    await navigate(page, sessions[0])
  }
  await navigate(page, sessions[1])
  await drop(page, 1)
  await expect(page.getByText("inspection-0.docx", { exact: true })).toBeVisible()
  expect(data.uploads).toHaveLength(1)
  expect(data.uploads[0].path.startsWith(`runs/${sessions[1].id}/attachments/`)).toBe(true)
})
