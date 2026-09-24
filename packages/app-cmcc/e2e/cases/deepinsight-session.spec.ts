import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { deepInsightFixture } from "../../src/pages/session/deepinsight/fixtures"
import { fixture } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL, video: "off" })

async function prepare(
  page: Page,
  repeated: boolean,
  options: {
    running?: boolean
    runningAgent?: string
    followup?: boolean
    nested?: boolean
    references?: string
    missingReferences?: boolean
  } = {},
) {
  const data = deepInsightFixture(repeated, !options.nested, options.nested)
  if (options.missingReferences) data.filenames.splice(data.filenames.indexOf("22-references.json"), 1)
  let running = options.running ?? false
  const events: unknown[] = []
  const messageReads: string[] = []
  const root = data.transcripts[0]
  const last = options.runningAgent
    ? data.transcripts.find((item) => item.session.agent === options.runningAgent)!
    : data.transcripts.at(-1)!
  const rootAnswer = root.messages.at(-1)!
  const lastAnswer = last.messages.at(-1)!
  const task = root.parts[rootAnswer.id].find(
    (part) =>
      part.type === "tool" &&
      part.tool === "task" &&
      part.state.status === "completed" &&
      part.state.metadata.sessionId === last.session.id,
  )!
  const pdf = last.parts[lastAnswer.id][0]
  if (task.type !== "tool" || pdf.type !== "tool") throw new Error("Fixture must contain producer tools")
  const taskState = task.state
  const pdfState = pdf.state
  if (running) {
    task.state = { status: "running", input: task.state.input, time: { start: 3000 } }
    pdf.state = { status: "running", input: pdf.state.input, time: { start: 3000 } }
  }
  if (options.followup) {
    data.root.agent = "build"
    const initialUser = root.messages[0]
    if (initialUser.role !== "user" || rootAnswer.role !== "assistant") throw new Error("Invalid fixture")
    const question = { ...initialUser, id: "followup-user", agent: "build", time: { created: 9000 } }
    const answer = {
      ...rootAnswer,
      id: "followup-answer",
      parentID: question.id,
      agent: "build",
      modelID: "followup-model",
      time: { created: 9001, completed: 9010 },
    }
    root.messages.push(question, answer)
    root.parts[question.id] = [
      { id: "followup-query", sessionID: data.root.id, messageID: question.id, type: "text", text: "补充说明研究结论" },
    ]
    root.parts[answer.id] = [
      { id: "followup-text", sessionID: data.root.id, messageID: answer.id, type: "text", text: "这是追问回复" },
    ]
  }
  const requests: string[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await mockOpenCodeServer(page, {
    ...fixture,
    directory: data.directory,
    project: { ...fixture.project, worktree: data.directory },
    sessions: data.transcripts.map((item) => ({ ...item.session })),
    pageMessages: (id) => {
      const transcript = data.transcripts.find((item) => item.session.id === id)
      return { items: transcript?.messages.map((info) => ({ info, parts: transcript.parts[info.id] })) ?? [] }
    },
    events: () => events.splice(0),
    eventRetry: 50,
    onMessages: ({ sessionID, phase }) => {
      if (phase === "end") messageReads.push(sessionID)
    },
  })
  await page.route("**/session/status*", (route) =>
    route.fulfill({
      json: running
        ? {
            [data.root.id]: { type: "busy" },
            [last.session.id]: { type: "busy" },
          }
        : {},
    }),
  )
  await page.route("**/session/*/todo*", (route) => {
    return route.fulfill({ json: [{ content: "不应重复显示的任务计划", status: "in_progress", priority: "high" }] })
  })
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("dockapi.accessToken", "deepinsight-test")
  })
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (value: unknown) => route.fulfill({ json: { code: 200, message: "ok", data: value } })
    if (path === "/api/user/profile")
      return json({
        user: { id: 99, name: "测试用户", phone: "", enabled: true, casePublishAllowed: true },
        workspace: { id: 99, workspaceKey: "test", directoryPath: data.directory, status: "READY" },
      })
    if (path === "/api/dockapi/sessions")
      return json([
        {
          id: "business",
          agentType: "deepinsight",
          openCodeSessionId: data.root.id,
          directoryPath: data.directory,
          openCodeSession: data.root,
          openCodeStatus: { type: running ? "busy" : "idle" },
          query: "进行深度研究",
          title: data.root.title,
          createdAt: "2026-09-16T00:00:00Z",
          updatedAt: "2026-09-16T00:00:00Z",
        },
      ])
    return json([])
  })
  await page.route("**/session/*/children?*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[2]
    return route.fulfill({
      json: data.transcripts.filter((item) => item.session.parentID === id).map((item) => item.session),
    })
  })
  await page.route("**/file**", (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith("/file")) return route.fallback()
    const path = url.searchParams.get("path") ?? ""
    requests.push(`${url.pathname}:${path}`)
    if (url.pathname === "/file" && path && data.rootPath.startsWith(`${path}/`)) {
      const name = data.rootPath.slice(path.length + 1).split("/")[0]
      return route.fulfill({
        json: [
          {
            name,
            path: `${path}/${name}`,
            absolute: `${data.directory}/${path}/${name}`,
            type: "directory",
            ignored: false,
          },
        ],
      })
    }
    if (url.pathname === "/file")
      return route.fulfill({
        json:
          path === data.rootPath
            ? data.filenames
                .filter((name) => !running || name !== "35-report.pdf")
                .map((name) => ({
                  name,
                  path: `${data.rootPath}/${name}`,
                  absolute: `${data.directory}/${data.rootPath}/${name}`,
                  type: "file",
                  ignored: false,
                }))
            : [],
      })
    if (url.pathname === "/file/preview")
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><html><body>深度研究 HTML 报告</body></html>",
      })
    if (url.pathname === "/file/content" && !data.filenames.some((name) => path === `${data.rootPath}/${name}`))
      return route.fulfill({ status: 404, json: { message: "File not found" } })
    if (url.pathname === "/file/content")
      return route.fulfill({
        json: {
          type: "text",
          content: path.endsWith("00-execution-trace.json")
            ? JSON.stringify({ route: { local_research_required: false, web_research_required: true } })
            : path.endsWith("22-references.json")
              ? (options.references ??
                JSON.stringify([
                  { key: "local:SRC-001", kind: "local", usage: "cited_in_report" },
                  { key: "https://example.com/a", kind: "web", usage: "cited_in_report" },
                  { key: "https://example.com/a", kind: "web", usage: "verified_reference_not_cited" },
                  { key: "https://example.com/b", kind: "web", usage: "extended_reference" },
                ]))
              : "# 研究报告\n\n最终研究正文",
          mimeType: "text/plain",
        },
      })
    return route.fulfill({ body: "file-content" })
  })
  const started = Date.now()
  await page.goto(`/server/${base64Encode(process.env.PLAYWRIGHT_BASE_URL!)}/session/${data.root.id}`)
  await expect(page.getByRole("button", { name: "分析团队", exact: true })).toBeVisible()
  await expect(page.getByText("信息源", { exact: true })).toBeVisible()
  await expect(page.getByText("消耗 token", { exact: true }).locator("..").locator("strong")).toHaveText(
    String(data.transcripts.length * 33),
  )
  console.log(
    JSON.stringify({
      benchmark: "deepinsight-ready",
      repeated,
      ms: Date.now() - started,
      dom: await page.locator("*").count(),
      fileRequests: requests.length,
      messageReads: messageReads.length,
    }),
  )
  return {
    data,
    errors,
    requests,
    updateTodo: () => {
      const part = root.parts[rootAnswer.id].find((part) => part.type === "text")!
      events.push(
        { type: "todo.updated", properties: { sessionID: data.root.id, todos: [{ content: "不应重复显示的任务计划", status: "in_progress", priority: "high" }] } },
        { type: "message.part.updated", properties: { part: { ...part, text: "研究总结，计划已同步" } } },
      )
    },
    finish: () => {
      running = false
      task.state = taskState
      pdf.state = pdfState
      events.push(
        { type: "message.part.updated", properties: { part: pdf } },
        { type: "message.part.updated", properties: { part: task } },
        { type: "session.status", properties: { sessionID: last.session.id, status: { type: "idle" } } },
        { type: "session.status", properties: { sessionID: data.root.id, status: { type: "idle" } } },
      )
    },
  }
}

for (const repeated of [false, true])
  test(`research history with ${repeated ? 18 : 13} executions lists script reports`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const state = await prepare(page, repeated)
    await expect(page.getByText("报告篇幅", { exact: true })).toBeVisible()
    await expect(page.getByText("信息源", { exact: true }).locator("..").locator("strong")).toHaveText("3 篇")
    await expect(page.locator('[contenteditable="true"]')).toBeVisible()
    await page.screenshot({
      path: `e2e/test-results/deepinsight-${repeated ? "retry" : "single"}-desktop.png`,
      fullPage: true,
    })
    await page.getByRole("button", { name: "文件", exact: true }).click()
    await expect(page.getByRole("button", { name: "预览", exact: true })).toHaveCount(state.data.filenames.length)
    await page.getByRole("button", { name: "文字报告", exact: true }).click()
    await expect(page.getByRole("button", { name: "20-report.md", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "35-report.pdf", exact: true })).toBeAttached()
    await expect(page.getByText("最终研究正文", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "可视化报告", exact: true }).click()
    await expect(page.frameLocator('iframe[title="30-report.html"]').getByText("深度研究 HTML 报告")).toBeVisible()
    await page.reload()
    await expect(page.getByRole("button", { name: "分析团队", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole("tab", { name: "分析结果", exact: true }).click()
    await expect(page.getByRole("button", { name: "分析团队", exact: true })).toBeVisible()
    await page.screenshot({
      path: `e2e/test-results/deepinsight-${repeated ? "retry" : "single"}-mobile.png`,
      fullPage: true,
    })
    expect(state.requests.some((request) => request === "/file:")).toBe(false)
    expect(state.errors).toEqual([])
  })

test("a running publisher does not finish early and its PDF appears after the SSE completion", async ({ page }) => {
  const state = await prepare(page, false, { running: true })
  await expect(page.getByRole("button", { name: "看回放", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "文件", exact: true }).click()
  await expect(page.getByRole("button", { name: "预览", exact: true })).toHaveCount(state.data.filenames.length - 1)
  state.finish()
  await expect(page.getByRole("button", { name: "预览", exact: true })).toHaveCount(state.data.filenames.length)
  await expect(page.getByRole("button", { name: "看回放", exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})

test("a followup keeps the research workbench and shows both the question and reply", async ({ page }) => {
  const state = await prepare(page, false, { followup: true })
  await expect(page.getByText("补充说明研究结论", { exact: true })).toBeVisible()
  await expect(page.getByText("这是追问回复", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("complementary", { name: "CMCC conversations" }).getByText("深度研究", { exact: true }),
  ).toHaveCount(2)
  await page.reload()
  await expect(page.getByRole("button", { name: "分析团队", exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})

test("expert messages have copy, actual metadata and completed duration without the todo dock", async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.setViewportSize({ width: 1440, height: 1000 })
  const state = await prepare(page, true, { followup: true })
  const answer = page.locator('[data-workbench-message="followup-answer"]')
  await expect(answer.locator("time")).toHaveAttribute("datetime", new Date(9001).toISOString())
  await expect(answer.getByText("followup-model", { exact: true })).toBeVisible()
  await answer.getByRole("button", { name: "复制消息", exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("这是追问回复")
  const question = page.locator('[data-workbench-message="followup-user"]')
  await question.getByRole("button", { name: "复制消息", exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("补充说明研究结论")
  await expect(page.locator('[data-component="session-todo-dock"]')).toHaveCount(0)
  const dag = page.getByRole("region", { name: "DeepInsight DAG" })
  await dag.getByRole("button", { name: /安全与需求分析师/ }).click()
  await expect(page.locator('[data-component="expert-duration"]')).toHaveText("用时 0秒")
  // The latest completed intent execution is child-1, not child-0.
  const expert = page.locator('[data-workbench-message="child-1-assistant"]')
  await expect(expert).toContainText("专家输出 1")
  await expect(expert.locator("time")).toHaveAttribute("datetime", new Date(1201).toISOString())
  await expert.getByRole("button", { name: "复制消息", exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("专家输出 1")
  await page.screenshot({ path: info.outputPath("expert-desktop.png") })
  await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
  await expect.poll(() => page.locator('aside[aria-label="CMCC conversations"]').evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole("tab", { name: "分析内容", exact: true })).toHaveAttribute("aria-selected", "true")
  await expect(expert).toBeVisible()
  await expect(page.locator('[data-component="expert-duration"]')).toBeVisible()
  await page.screenshot({ path: info.outputPath("expert-mobile.png") })
  expect(state.errors).toEqual([])
})

for (const mode of ["missing", "invalid", "empty"] as const)
  test(`source count handles ${mode} references without inventing a count`, async ({ page }) => {
    const state = await prepare(page, false, {
      missingReferences: mode === "missing",
      references: mode === "empty" ? "[]" : "{",
    })
    await expect(page.getByText("信息源", { exact: true }).locator("..").locator("strong")).toHaveText(
      mode === "empty" ? "0 篇" : "--",
    )
    expect(state.errors).toEqual([])
  })

test("running and replaying experts do not expose final duration or future followups", async ({ page }) => {
  const state = await prepare(page, false, { running: true, runningAgent: "deepinsight/di-query-planner", followup: true })
  state.updateTodo()
  await expect(page.getByText("研究总结，计划已同步", { exact: true })).toBeVisible()
  await expect(page.locator('[data-component="session-todo-dock"]')).toHaveCount(0)
  await page
    .getByRole("region", { name: "DeepInsight DAG" })
    .getByRole("button", { name: /研究规划专家/ })
    .click()
  await expect(page.locator('[data-component="expert-duration"]')).toHaveCount(0)
  state.finish()
  await expect(page.locator('[data-component="expert-duration"]')).toBeVisible()
  await page.getByRole("button", { name: "看回放", exact: true }).click()
  await expect(page.locator('[data-workbench-message="followup-answer"]')).toHaveCount(0)
  await expect(page.getByText("信息源", { exact: true }).locator("..").locator("strong")).toHaveText("--")
  await page
    .getByRole("region", { name: "DeepInsight DAG" })
    .getByRole("button", { name: /研究规划专家/ })
    .click()
  await expect(page.locator('[data-component="expert-duration"]')).toHaveCount(0)
  await page.getByRole("button", { name: "停止回放", exact: true }).click()
  await expect(page.locator('[data-component="expert-duration"]')).toBeVisible()
  await expect(page.getByText("信息源", { exact: true }).locator("..").locator("strong")).toHaveText("3 篇")
  expect(state.errors).toEqual([])
})

for (const repeated of [false, true])
  test(`nested research reports resolve their actual directory (${repeated ? "retries" : "single"})`, async ({
    page,
  }) => {
    const state = await prepare(page, repeated, { nested: true })
    const length = page.getByText("报告篇幅", { exact: true }).locator("..").locator("strong")
    await expect(length).toHaveText("10字")
    expect(state.requests).toContain(`/file/content:${state.data.rootPath}/00-execution-trace.json`)
    expect(state.requests).not.toContain("/file/content:runs/test-run/00-execution-trace.json")
    await page.getByRole("button", { name: "文字报告", exact: true }).click()
    await expect(page.getByRole("button", { name: "20-report.md", exact: true })).toHaveAttribute("data-selected", "")
    await page.getByRole("button", { name: "分析团队", exact: true }).click()
    await expect(length).toHaveText("10字")
    await page.reload()
    await expect(length).toHaveText("10字")
    expect(state.errors).toEqual([])
  })
