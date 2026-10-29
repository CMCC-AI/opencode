import { expect, test, type Page } from "@playwright/test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { setupHomePage, homeDirectory, homeSession } from "./home-fixture"

test.use({ locale: "zh-CN" })

async function home(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 900 })
  await setupHomePage(page, { models: true })
  await page.goto("/app")
  await expect(page.locator('[data-component="prompt-input"]')).toBeVisible()
  await expect(page.locator('[data-action="prompt-model"]')).not.toBeDisabled()
  if (width < 760) {
    await page.getByRole("button", { name: "隐藏左栏" }).click()
    await expect.poll(() => page.locator('aside[aria-label="CMCC conversations"]').evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
  }
  await page.evaluate(() => document.fonts.ready)
}

for (const width of [1440, 390]) {
  test(`selects an expert team without leaving the draft at ${width}`, async ({ page }, info) => {
    await home(page, width)
    const editor = page.locator('[data-component="prompt-input"]')
    await editor.fill("请分析我的材料")
    const url = page.url()
    const before = await editor.boundingBox()
    await page.getByRole("button", { name: "打开更多操作" }).click()
    await expect(page.getByRole("button", { name: "添加文件夹", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "专家团", exact: true }).click()
    const menu = page.locator("[data-cmcc-expert-menu]")
    await expect(menu).toBeVisible()
    for (const name of [
      "深度研究专家团",
      "财经分析专家团",
      "购买决策专家团",
      "巡察分析专家团",
      "谈参高拜专家团",
      "位置决策专家团",
      "科研专家团",
    ])
      await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible()
    await expect(menu).toHaveCSS("opacity", "1")
    const box = await menu.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: info.outputPath("expert-teams.png") })
    await menu.getByRole("menuitem", { name: "巡察分析专家团", exact: true }).click()
    await expect(page.locator('[data-action="prompt-selected-expert"]')).toContainText("巡察分析专家团")
    await expect(editor).toHaveText("请分析我的材料")
    expect(page.url()).toBe(url)
    expect(await editor.boundingBox()).toEqual(before)
    await expect
      .poll(() => page.evaluate(() => Object.values(localStorage).join("")))
      .toContain("deepinspect/deepinspect-team-lead")
    await page.reload()
    await expect(page.locator('[data-action="prompt-selected-expert"]')).toContainText("巡察分析专家团")
  })
}

test("uploads a Word original without exposing or sending its extracted body", async ({ page }) => {
  await home(page)
  const uploads: Array<{ path: string; content: string }> = []
  await page.route("**/file/directory*", (route) => route.fulfill({ json: {} }))
  await page.route("**/file/upload*", async (route) => {
    const upload = route.request().postDataJSON()
    uploads.push(upload)
    await route.fulfill({ json: { path: upload.path } })
  })
  const secret = Buffer.from("WORD_BODY_MUST_NOT_APPEAR_IN_CHAT")
  await page
    .locator('input[type="file"][accept]')
    .setInputFiles({
      name: "巡察材料.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: secret,
    })
  await expect.poll(() => uploads.length).toBe(1)
  await expect(page.getByText("巡察材料.docx", { exact: true })).toBeVisible()
  expect(Buffer.from(uploads[0].content, "base64")).toEqual(secret)
  expect(uploads[0].path).toMatch(/^runs\/.+\/attachments\/upload-[\da-f-]+\/巡察材料\.docx$/)
  await expect(page.getByText(secret.toString(), { exact: false })).toHaveCount(0)
  await page.getByRole("button", { name: "打开更多操作" }).click()
  await page.getByRole("button", { name: "专家团", exact: true }).click()
  await page.getByRole("menuitem", { name: "巡察分析专家团", exact: true }).click()

  const editor = page.locator('[data-component="prompt-input"]')
  await editor.fill("分析上传材料")
  let request:
    | { agent: string; parts: Array<{ type: string; url?: string; text?: string; filename?: string; mime?: string }> }
    | undefined
  let agentType: string | undefined
  await page.route("**/api/dockapi/sessions", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { code: 200, data: [] } })
    const body = route.request().postDataJSON()
    agentType = body.agentType
    const session = { ...homeSession, metadata: { cmccArtifactDirectory: body.artifactDirectory } }
    await route.fulfill({
      json: {
        code: 200,
        data: {
          id: "uploaded-business",
          agentType: body.agentType,
          title: "分析上传材料",
          query: body.query,
          directoryPath: homeDirectory,
          openCodeSessionId: homeSession.id,
          openCodeSession: session,
          openCodeStatus: { type: "idle" },
        },
      },
    })
  })
  await page.route(`**/session/${homeSession.id}*`, (route) =>
    new URL(route.request().url()).pathname === `/session/${homeSession.id}`
      ? route.fulfill({ json: { ...homeSession } })
      : route.fallback(),
  )
  await page.route(`**/session/${homeSession.id}/prompt_async*`, async (route) => {
    request = route.request().postDataJSON()
    await route.fulfill({ status: 204 })
  })
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect.poll(() => request).toBeDefined()
  expect(agentType).toBe("deepinspect")
  expect(request!.agent).toBe("deepinspect/deepinspect-team-lead")
  expect(request!.parts.filter((part) => part.type === "text").map((part) => part.text)).toEqual(["分析上传材料"])
  expect(request!.parts.find((part) => part.type === "file")).toMatchObject({
    filename: "巡察材料.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    url: expect.stringContaining("opencode-attachment=reference"),
  })
  expect(JSON.stringify(request)).not.toContain(secret.toString())
})

test("preserves folder paths and blocks sending until the whole upload completes", async ({ page }, info) => {
  await home(page)
  const temporary = await mkdtemp(path.join(tmpdir(), "opencode-folder-upload-"))
  const directory = path.join(temporary, "巡察资料")
  await mkdir(path.join(directory, "一"), { recursive: true })
  await mkdir(path.join(directory, "二"), { recursive: true })
  await writeFile(path.join(directory, "一/report.docx"), "first original")
  await writeFile(path.join(directory, "二/report.docx"), "second original")
  const uploads: Array<{ path: string }> = []
  const gate = Promise.withResolvers<void>()
  try {
    await page.route("**/file/directory*", (route) => route.fulfill({ json: {} }))
    await page.route("**/file/upload*", async (route) => {
      const body = route.request().postDataJSON()
      uploads.push(body)
      await gate.promise
      await route.fulfill({ json: { path: body.path } })
    })
    await page.locator('[data-component="prompt-input"]').fill("分析文件夹材料")
    await page.getByRole("button", { name: "打开更多操作" }).click()
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "添加文件夹", exact: true }).click()
    await (await chooser).setFiles(directory)
    await expect(page.locator('[data-component="attachment-upload-progress"]')).toBeVisible()
    await expect(page.getByRole("button", { name: "发送", exact: true })).toBeDisabled()
    await expect.poll(() => uploads.length).toBe(1)
    gate.resolve()
    await expect.poll(() => uploads.length).toBe(2)
    await expect(page.locator('[data-component="attachment-upload-progress"]')).toHaveCount(0)
    await expect(page.getByRole("button", { name: "发送", exact: true })).not.toBeDisabled()
    expect(uploads[0].path.replace(/\/巡察资料\/.+$/, "")).toBe(uploads[1].path.replace(/\/巡察资料\/.+$/, ""))
    expect(uploads.map((upload) => upload.path.split("/巡察资料/")[1]).sort()).toEqual([
      "一/report.docx",
      "二/report.docx",
    ])
    await page.screenshot({ path: info.outputPath("folder-upload.png") })
  } finally {
    gate.resolve()
    await rm(temporary, { recursive: true, force: true })
  }
})

test("existing conversation expert menus insert the real Agent reference without navigation", async ({
  page,
  baseURL,
}) => {
  await setupHomePage(page, { models: true, history: true })
  await page.goto(`/server/${base64Encode(baseURL!)}/session/${homeSession.id}`)
  await page.getByRole("button", { name: "打开更多操作" }).click()
  await page.getByRole("button", { name: "专家团", exact: true }).click()
  await page.getByRole("menuitem", { name: "深度研究专家团", exact: true }).click()
  await expect(page.locator('[data-component="prompt-input"]')).toContainText("@deepinsight/deepinsight-team-lead")
  await expect(page).toHaveURL(new RegExp(`/session/${homeSession.id}$`))
})
