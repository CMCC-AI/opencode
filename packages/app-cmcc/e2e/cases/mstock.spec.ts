import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mstockFixture } from "../../src/pages/session/mstock/fixtures"
import { fixture } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"
test.use({ channel: process.env.PLAYWRIGHT_CHANNEL, video: "off" })

async function prepare(page: Page, legacy = false, form = false) {
  const data = mstockFixture(legacy)
  const errors: string[] = []
  const sent: Array<Record<string, unknown>> = []
  const counters = { creates: 0, prepares: 0, uploads: 0 }
  let reject = false
  let rejectPrepare = false
  page.on("pageerror", (error) => errors.push(error.message))
  await mockOpenCodeServer(page, {
    ...fixture,
    directory: data.directory,
    project: { ...fixture.project, worktree: data.directory },
    sessions: data.transcripts.map((entry) => entry.session),
    pageMessages: (id) => ({
      items: form
        ? []
        : (data.transcripts.find((entry) => entry.session.id === id)?.messages ?? []).map((info) => ({
            info,
            parts: data.transcripts.find((entry) => entry.session.id === id)?.parts[info.id] ?? [],
          })),
    }),
  })
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("dockapi.accessToken", "mstock-test")
  })
  await page.route("**/provider?*", (route) => {
    if (new URL(route.request().url()).pathname !== "/provider") return route.fallback()
    return route.fulfill({
      json: {
        all: [
          {
            id: "alibaba-cn",
            name: "Test",
            models: { "qwen3.7-plus": { id: "qwen3.7-plus", name: "Qwen3.7 Plus", limit: { context: 200000 } } },
          },
        ],
        connected: ["alibaba-cn"],
        default: { "alibaba-cn": "qwen3.7-plus" },
      },
    })
  })
  await page.route("**/agent?*", (route) => {
    if (new URL(route.request().url()).pathname !== "/agent") return route.fallback()
    return route.fulfill({
      json: [
        { name: "build", mode: "primary" },
        { name: "mstock/mstock", mode: "subagent" },
      ],
    })
  })
  await page.route("**/session/status*", (route) => route.fulfill({ json: {} }))
  await page.route("**/session/*/children?*", (route) =>
    route.fulfill({
      json: form
        ? []
        : data.transcripts
            .filter((entry) => entry.session.parentID === new URL(route.request().url()).pathname.split("/")[2])
            .map((entry) => entry.session),
    }),
  )
  const binding = {
    id: "business-mstock",
    agentType: "mstock",
    openCodeSessionId: data.root.id,
    directoryPath: data.directory,
    openCodeSession: data.root,
    openCodeStatus: { type: "idle" },
    title: data.root.title,
    query: "多股对比",
    createdAt: "2026-09-17",
    updatedAt: "2026-09-17",
  }
  const snapshot = {
    schemaVersion: 1,
    caseCode: "mstock",
    capturedAt: "2026-09-18T00:00:00Z",
    rootSessionId: data.root.id,
    rootAgent: "mstock/mstock",
    agentType: "mstock",
    query: "多股对比",
    sessions: data.transcripts.map((entry) => ({
      session: entry.session,
      status: entry.status,
      messages: entry.messages.map((info) => ({ info, parts: entry.parts[info.id] })),
    })),
    artifacts: data.filenames.map((path) => ({
      path,
      size: 100,
      contentType: path.endsWith(".html") ? "text/html" : "text/plain",
    })),
  }
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith("/api/")) return route.fallback()
    const json = (value: unknown) => route.fulfill({ json: { code: 200, message: "ok", data: value } })
    if (path === "/api/user/profile")
      return json({
        user: { id: 999, name: "测试用户", phone: "", enabled: true, casePublishAllowed: true },
        workspace: { id: 999, directoryPath: data.directory, workspaceKey: "test", status: "READY" },
      })
    if (path === "/api/dockapi/sessions" && route.request().method() === "POST") {
      counters.creates++
      return json(binding)
    }
    if (path === "/api/dockapi/sessions") return json(form ? [] : [binding])
    if (path === "/api/dockapi/sessions/business-mstock") return json(binding)
    if (path === "/api/dockapi/mstock/sources")
      return json({
        items: [1, 2].map((number) => ({
          businessSessionId: `source-${number}`,
          title: `历史报告 ${number}`,
          createdAt: "2026-09-17",
        })),
        nextPage: null,
      })
    if (path.endsWith("/sources/prepare")) {
      counters.prepares++
      if (rejectPrepare)
        return route.fulfill({ status: 409, json: { code: 409, message: "所选报告仍在运行", data: null } })
      return json(
        route
          .request()
          .postDataJSON()
          .sourceBusinessSessionIds.map((id: string) => ({
            businessSessionId: id,
            title: id,
            path: `${data.directory}/runs/comparison-test/inputs/history/${id}/30-final-report.md`,
          })),
      )
    }
    if (path.endsWith("/preview-ticket"))
      return json({
        baseUrl: `${process.env.PLAYWRIGHT_BASE_URL}/api/dockapi/case-preview/mstock`,
        expiresAt: "2099-01-01",
      })
    if (path.endsWith("/snapshot")) return route.fulfill({ json: snapshot })
    if (path.includes("/case-preview/"))
      return route.fulfill({
        contentType: path.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
        body: path.endsWith(".html")
          ? "<!doctype html><html><body>多股可视化正文</body></html>"
          : "# 对比报告\n\n最终对比正文",
      })
    if (path === "/api/dockapi/cases/mstock")
      return json({
        ...snapshot,
        caseName: "多股对比案例",
        category: "finance",
        categoryLabel: "AI+财经",
        caseTag: "AI+财经",
        snapshotVersion: "one",
        coverUrl: "",
        reportCharCount: 10,
        publishedAt: "2026-09-18",
      })
    return json([])
  })
  await page.route("**/session/*/prompt_async*", (route) => {
    sent.push(route.request().postDataJSON())
    return reject ? route.fulfill({ status: 500, json: { message: "发送失败" } }) : route.fulfill({ status: 204 })
  })
  await page.route("**/file**", (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith("/file")) return route.fallback()
    const path = url.searchParams.get("path") ?? ""
    if (url.pathname === "/file/upload") {
      counters.uploads++
      return route.fulfill({ json: { path } })
    }
    if (url.pathname === "/file/directory") return route.fulfill({ json: { path } })
    if (url.pathname === "/file")
      return route.fulfill({
        json:
          path === data.rootPath
            ? data.filenames.map((name) => ({
                name,
                path: `${path}/${name}`,
                absolute: `${data.directory}/${path}/${name}`,
                type: "file",
                ignored: false,
              }))
            : [],
      })
    if (url.pathname === "/file/preview")
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><html><body>多股可视化正文</body></html>",
      })
    if (url.pathname === "/file/content")
      return route.fulfill({
        json: {
          type: "text",
          content: path.endsWith(".html")
            ? "<!doctype html><html><body>多股可视化正文</body></html>"
            : "# 对比报告\n\n最终对比正文",
        },
      })
    return route.fulfill({ body: "file" })
  })
  return {
    data,
    errors,
    sent,
    counters,
    reject: (value: boolean) => {
      reject = value
    },
    rejectPrepare: (value: boolean) => {
      rejectPrepare = value
    },
  }
}

for (const legacy of [false, true])
  test(`mstock nested history and eight files (${legacy})`, async ({ page }, testInfo) => {
    const state = await prepare(page, legacy)
    const started = Date.now()
    await page.goto(`/server/${base64Encode(process.env.PLAYWRIGHT_BASE_URL!)}/session/${state.data.root.id}`)
    await expect(page.getByText("3 位", { exact: true })).toBeVisible()
    await expect(page.getByText("消耗 token", { exact: true }).locator("..").locator("strong")).toHaveText("165")
    await expect(page.getByText("报告篇幅", { exact: true }).locator("..").locator("strong")).toHaveText("10字")
    await expectVerticalDag(page)
    console.log(
      JSON.stringify({
        benchmark: "mstock-ready",
        legacy,
        ms: Date.now() - started,
        dom: await page.locator("*").count(),
      }),
    )
    await page.screenshot({ path: testInfo.outputPath(`mstock-session-${legacy}.png`), fullPage: true })
    await page.getByRole("button", { name: "文件", exact: true }).click()
    for (const filename of state.data.filenames)
      await expect(page.getByRole("button", { name: filename })).toBeVisible()
    await page.getByRole("button", { name: "文字报告", exact: true }).click()
    await expect(page.getByText("最终对比正文", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "可视化报告", exact: true }).click()
    await expect(page.frameLocator("iframe").getByText("多股可视化正文")).toBeVisible()
    await page.getByRole("button", { name: "看回放", exact: true }).click()
    await expect(page.getByRole("button", { name: "停止回放", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "停止回放", exact: true }).click()
    expect(state.errors).toEqual([])
  })

for (const width of [1920, 1440, 1024, 390])
  test(`form uses original artwork and interactive display dimensions (${width})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 950 })
    const state = await prepare(page, false, true)
    await page.goto("/mstock")
    if (width < 640) {
      await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
      await expect
        .poll(() => page.locator(".mstock-form").evaluate((element) => element.clientWidth))
        .toBeGreaterThan(380)
      await expect
        .poll(() => page.locator(".mstock-heading h1").evaluate((element) => element.getBoundingClientRect().top))
        .toBeGreaterThan(40)
    }
    await expect(page.getByText("历史报告 1", { exact: true })).toBeVisible()
    const form = await page.locator(".mstock-form").boundingBox()
    const scroll = await page.locator(".mstock-scroll").boundingBox()
    const content = await page.locator(".mstock-body").boundingBox()
    expect(scroll!.x).toBeCloseTo(form!.x, 0)
    expect(scroll!.x + scroll!.width).toBeCloseTo(form!.x + form!.width, 0)
    expect(content!.width).toBeLessThanOrEqual(1160)
    if (width === 1920) expect(scroll!.width).toBeGreaterThan(content!.width + 200)
    await expect(page.locator(".mstock-scroll")).toHaveCSS("overflow-y", "auto")
    await expect(page.locator(".mstock-body")).toHaveCSS("overflow-y", "visible")
    expect(
      await page.locator(".mstock-hero").evaluate((hero) => {
        const bounds = hero.getBoundingClientRect()
        return Array.from(hero.querySelectorAll(".mstock-workflow-label")).every((label) => {
          const rect = label.getBoundingClientRect()
          return rect.left >= bounds.left && rect.right <= bounds.right
        })
      }),
    ).toBe(true)
    await expect(page.locator(".mstock-dimensions input:checked")).toHaveCount(7)
    await expect(page.locator(".mstock-dimensions input:disabled")).toHaveCount(0)
    const firstDimension = page.locator(".mstock-dimensions label").first()
    const before = await firstDimension.boundingBox()
    await page.getByRole("checkbox", { name: "估值水平", exact: true }).uncheck()
    await expect(page.locator(".mstock-launch > span")).toContainText("6 个对比维度")
    expect((await firstDimension.boundingBox())!.width).toBeCloseTo(before!.width, 0)
    await page.getByRole("checkbox", { name: "估值水平", exact: true }).press("Space")
    await expect(page.locator(".mstock-dimensions input:checked")).toHaveCount(7)
    await expect(page.locator(".mstock-hero")).toHaveCSS(
      "background-image",
      /comparison-hero-background(?:-[\w-]+)?\.svg/,
    )
    const backgroundUrl = await page
      .locator(".mstock-hero")
      .evaluate((element) => getComputedStyle(element).backgroundImage.match(/^url\(["']?(.+?)["']?\)$/)?.[1])
    expect(backgroundUrl).toBeTruthy()
    const background = await page.request.get(backgroundUrl!)
    expect(background.headers()["content-type"]).toContain("image/svg+xml")
    expect(await background.text()).toContain("<svg")
    for (const icon of await page.locator(".mstock-source-kind, .mstock-upload > img").all()) {
      await expect(icon).not.toHaveAttribute("src", /^\/mstock\/.*\.svg/)
      await icon.evaluate((element: HTMLImageElement) => element.decode())
    }
    await expect(page.locator(".mstock-source-section > header")).toHaveCSS(
      "background-image",
      /module-background\.png/,
    )
    await expect
      .poll(() =>
        page
          .locator(".mstock-form img")
          .evaluateAll((images) =>
            images.every(
              (image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true)
    await expect(page.getByRole("button", { name: "开始多股票综合对比" })).toBeDisabled()
    await page.locator(".mstock-source input").first().check()
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "外部报告.md", mimeType: "text/plain", buffer: Buffer.from("外部报告正文") })
    await expect(page.getByRole("button", { name: "开始多股票综合对比" })).toBeEnabled()
    for (const checkbox of await page.locator(".mstock-dimensions input").all()) await checkbox.uncheck()
    await expect(page.locator(".mstock-launch > span")).toContainText("0 个对比维度")
    await expect(page.getByRole("button", { name: "开始多股票综合对比" })).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath(`mstock-dimensions-${width}.png`), fullPage: true })
    await page.locator(".mstock-scroll").evaluate((element) => {
      element.scrollTop = 0
    })
    await page.screenshot({ path: testInfo.outputPath(`mstock-form-${width}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole("button", { name: "开始多股票综合对比" }).click()
    await expect(page).toHaveURL(/\/session\/mstock-root/)
    expect(state.counters.creates).toBe(1)
    expect(state.counters.uploads).toBe(1)
    expect(state.sent).toHaveLength(1)
    expect(state.sent[0].agent).toBe("build")
    expect(JSON.stringify(state.sent[0])).not.toContain("comparison_dimensions")
    expect(JSON.stringify(state.sent[0])).not.toContain("估值水平")
    expect(state.sent[0].parts).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "agent", name: "mstock/mstock" })]),
    )
    expect(state.errors).toEqual([])
  })

test("submission failure preserves inputs and reuses binding and message ID", async ({ page }) => {
  const state = await prepare(page, false, true)
  state.reject(true)
  await page.goto("/mstock")
  await page.locator(".mstock-source input").first().check()
  await page.locator(".mstock-source input").nth(1).check()
  await page.getByRole("button", { name: "开始多股票综合对比" }).click()
  await expect(page.locator(".mstock-error")).toBeVisible()
  const first = state.sent[0].messageID
  state.reject(false)
  await page.getByRole("button", { name: "开始多股票综合对比" }).click()
  await expect(page).toHaveURL(/\/session\/mstock-root/)
  expect(state.counters.creates).toBe(1)
  expect(state.sent[1].messageID).toBe(first)
})

test("finance snapshot selects mstock UI and do-same returns to empty form", async ({ page }) => {
  const state = await prepare(page)
  await page.goto("/cases/mstock")
  await expect(page.getByText("3 位", { exact: true })).toBeVisible()
  await expect(page.getByText("报告篇幅", { exact: true }).locator("..").locator("strong")).toHaveText("10字")
  await expectVerticalDag(page)
  await page.getByRole("button", { name: "文件", exact: true }).click()
  await expect(page.getByRole("button", { name: /对比文字报告/ })).toBeVisible()
  await page.getByRole("button", { name: "做同款", exact: true }).click()
  await expect(page).toHaveURL(/\/mstock$/)
  await expect(page.locator(".mstock-source input:checked")).toHaveCount(0)
  expect(state.sent).toHaveLength(0)
  expect(state.errors).toEqual([])
})

test("two uploaded reports work without selecting history", async ({ page }) => {
  const state = await prepare(page, false, true)
  await page.goto("/mstock")
  await page.locator('input[type="file"]').setInputFiles([
    { name: "A.md", mimeType: "text/plain", buffer: Buffer.from("report A") },
    { name: "B.txt", mimeType: "text/plain", buffer: Buffer.from("report B") },
  ])
  await page.getByRole("button", { name: "开始多股票综合对比" }).click()
  await expect(page).toHaveURL(/\/session\/mstock-root/)
  expect(state.counters.uploads).toBe(2)
  expect(state.sent).toHaveLength(1)
})

test("source revalidation failure never sends and retry survives a reload", async ({ page }) => {
  const state = await prepare(page, false, true)
  state.rejectPrepare(true)
  await page.goto("/mstock")
  await page.locator(".mstock-source input").first().check()
  await page.locator(".mstock-source input").nth(1).check()
  await page.getByRole("button", { name: "开始多股票综合对比" }).click()
  await expect(page.getByRole("alert")).toContainText("所选报告仍在运行")
  expect(state.sent).toHaveLength(0)
  state.rejectPrepare(false)
  await page.reload()
  await expect(page.locator(".mstock-source input:checked")).toHaveCount(2)
  await page.getByRole("button", { name: "开始多股票综合对比" }).click()
  await expect(page).toHaveURL(/\/session\/mstock-root/)
  expect(state.counters.creates).toBe(1)
})

test("followup keeps the workbench, its question and reply", async ({ page }) => {
  const state = await prepare(page)
  const root = state.data.transcripts[0]
  const question = { ...root.messages[0], id: "followup-u", time: { created: 2500 } }
  const answer = { ...root.messages[1], id: "followup-a", time: { created: 2501, completed: 2600 } }
  root.messages = [...root.messages, question, answer]
  root.parts[question.id] = [
    { id: "followup-query", messageID: question.id, sessionID: root.session.id, type: "text", text: "再比较一下风险" },
  ]
  root.parts[answer.id] = [
    { id: "followup-answer", messageID: answer.id, sessionID: root.session.id, type: "text", text: "这是补充风险对比" },
  ]
  await page.goto(`/server/${base64Encode(process.env.PLAYWRIGHT_BASE_URL!)}/session/${state.data.root.id}`)
  await expect(page.getByText("3 位", { exact: true })).toBeVisible()
  await expect(page.getByText("再比较一下风险", { exact: true })).toBeVisible()
  await expect(page.getByText("这是补充风险对比", { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText("3 位", { exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})

for (const width of [1440, 390])
  test(`industry entry stays at the DeepTrading dialog's bottom left (${width})`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 })
    const state = await prepare(page, false, true)
    await page.goto("/expert")
    if (width < 640) await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
    await page
      .getByRole("button")
      .filter({ has: page.getByRole("heading", { name: "AI + 财经", exact: true }) })
      .click()
    const entry = page.getByRole("button", { name: "多股对比", exact: true })
    const cancel = page.getByRole("button", { name: "取消", exact: true })
    await expect(entry).toBeVisible()
    const summon = page.getByRole("button", { name: "召唤产业专家团", exact: true })
    const appearance = (button: HTMLElement) => {
      const css = getComputedStyle(button)
      return { background: css.backgroundImage, color: css.color, shadow: css.boxShadow }
    }
    expect(await entry.evaluate(appearance)).toEqual(await summon.evaluate(appearance))
    await expect(entry.locator("svg")).toHaveCSS("color", "rgb(255, 255, 255)")
    expect(
      await entry
        .locator("..")
        .locator("button")
        .evaluateAll((buttons) =>
          buttons.every(
            (button) =>
              getComputedStyle(button).whiteSpace === "nowrap" &&
              button.scrollWidth <= button.clientWidth + 1 &&
              button.scrollHeight <= button.clientHeight + 1,
          ),
        ),
    ).toBe(true)
    const left = await entry.boundingBox()
    const right = await cancel.boundingBox()
    expect(left!.x + left!.width).toBeLessThan(right!.x)
    expect(Math.abs(left!.y - right!.y)).toBeLessThan(3)
    await page.screenshot({ path: info.outputPath(`mstock-entry-${width}.png`), fullPage: true })
    await entry.click()
    await expect(page).toHaveURL(/\/mstock$/)
    await expect(page.getByRole("button", { name: "开始多股票综合对比" })).toBeVisible()
    expect(state.errors).toEqual([])
  })

async function expectVerticalDag(page: Page) {
  const dag = page.getByRole("region", { name: "多股对比 DAG", exact: true })
  await expect(dag).toHaveAttribute("data-layout", "vertical")
  await expect(dag.locator("[data-agent-id]")).toHaveCount(3)
  const boxes = await dag.locator("[data-agent-id]").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, top: rect.top, bottom: rect.bottom }
    }),
  )
  for (let index = 1; index < boxes.length; index++) {
    expect(boxes[index].x).toBeCloseTo(boxes[0].x, 0)
    expect(boxes[index].top).toBeGreaterThan(boxes[index - 1].bottom)
  }
  await expect
    .poll(() =>
      dag
        .locator("path[data-edge]")
        .evaluateAll(
          (edges) =>
            edges.length === 2 &&
            edges.every((edge) => /^M [\d.]+ [\d.]+ V [\d.]+$/.test(edge.getAttribute("d") ?? "")),
        ),
    )
    .toBe(true)
}

test("comparison uses the identical full-page background as cases", async ({ page }) => {
  await prepare(page, false, true)
  await page.goto("/mstock")
  const backdrop = await page
    .locator("[data-cmcc-page-background]")
    .evaluate((element) => getComputedStyle(element).backgroundImage)
  const base = await page.locator(".mstock-form").evaluate((element) => getComputedStyle(element).backgroundColor)
  await page.route("**/api/dockapi/cases/overview", (route) =>
    route.fulfill({ json: { code: 200, message: "ok", data: { groups: [] } } }),
  )
  await page.goto("/cases")
  await expect(page.locator("[data-cmcc-page-background]")).toHaveCSS("background-image", backdrop)
  await expect(page.locator('[data-page="cmcc-cases"]')).toHaveCSS("background-color", base)
})
