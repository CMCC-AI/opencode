import { expect, test } from "@playwright/test"
import { CMCC_KNOWLEDGE_STORAGE_KEY, cmccKnowledgeRoot } from "../../src/utils/cmcc-knowledge"
import { homeDirectory, setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN" })

for (const cached of [false, true]) {
  test(`graph starts at minimum size without resetting layout preferences (cached=${cached})`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await setupHomePage(page, { models: true })
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    const notebook = {
      id: "graph-size-test",
      name: "图谱节点大小测试",
      emoji: "",
      description: "测试数据",
      directory: `${cmccKnowledgeRoot("C:/OpenCode")}/graph-size-test`,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
    }
    await page.addInitScript(
      ({ key, notebook, cached }) => {
        if (window !== window.top) return
        localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([notebook]))
        const graphKey = "opencode.global.dat:knowledge-graph"
        if (cached && !localStorage.getItem(graphKey))
          localStorage.setItem(graphKey, JSON.stringify({ nodeScale: 1.6, linkDistance: 95, repulsion: 250 }))
      },
      { key: CMCC_KNOWLEDGE_STORAGE_KEY, notebook, cached },
    )
    await page.route("**/file?*", (route) => {
      const directory = new URL(route.request().url()).searchParams.get("directory")
        ?? decodeURIComponent(route.request().headers()["x-opencode-directory"] ?? "")
      return route.fulfill({
        json: directory === cmccKnowledgeRoot("C:/OpenCode")
          ? [{ name: "graph-size-test", path: "graph-size-test", absolute: notebook.directory, type: "directory" }]
          : [],
      })
    })
    await page.route("**/path?*", (route) => {
      const directory = new URL(route.request().url()).searchParams.get("directory")
        ?? (decodeURIComponent(route.request().headers()["x-opencode-directory"] ?? "") || homeDirectory)
      return route.fulfill({ json: { home: "C:/OpenCode", directory, worktree: directory, state: directory, config: directory } })
    })
    const session = {
      id: "ses_graph_size_test",
      slug: "graph-size-test",
      projectID: "graph-size-test",
      directory: notebook.directory,
      title: "图谱参数测试对话",
      version: "v2",
      time: { created: 1, updated: 1 },
      metadata: { cmccKnowledgeNotebookID: notebook.id, cmccKnowledgeKind: "chat" },
    }
    await page.route(/\/session(?:\?.*)?$/, (route) => route.fulfill({ json: [session] }))
    await page.route(/\/session\/ses_graph_size_test(?:\?.*)?$/, (route) =>
      route.request().isNavigationRequest() ? route.fallback() : route.fulfill({ json: session }),
    )
    await page.route("**/file/knowledge-graph?*", (route) => route.fulfill({
      json: {
        nodes: ["研究主题", "研究方法", "研究结论"].map((label, index) => ({
          id: `02_LLM_Wiki/page-${index}.md`,
          path: `02_LLM_Wiki/page-${index}.md`,
          label,
          degree: 2,
          inDegree: 1,
          outDegree: 1,
          x: 0,
          y: 0,
        })),
        edges: [0, 1, 2].map((index) => ({
          id: `edge-${index}`,
          source: `02_LLM_Wiki/page-${index}.md`,
          target: `02_LLM_Wiki/page-${(index + 1) % 3}.md`,
        })),
      },
    }))
    await page.goto("/app")
    await expect(page.locator('[data-component="prompt-input"][contenteditable="true"]')).toBeVisible()
    await page.getByRole("button", { name: "AI Wiki", exact: true }).click()
    await expect(page.getByRole("heading", { name: "DeepInsight Wiki", exact: true })).toBeVisible()
    await page.getByText(notebook.name, { exact: true }).click()
    const canvas = page.getByTestId("knowledge-graph-canvas").locator("canvas")
    await expect(canvas).toBeVisible()
    await page.getByRole("button", { name: "图谱参数", exact: true }).click()
    const size = page.getByRole("slider", { name: /节点大小/ })
    const distance = page.getByRole("slider", { name: /连线距离/ })
    const repulsion = page.getByRole("slider", { name: /节点斥力/ })
    await expect(size).toHaveValue("0.65")
    await expect(size).toHaveAttribute("min", "0.65")
    await expect(distance).toHaveValue(cached ? "95" : "70")
    await expect(repulsion).toHaveValue(cached ? "250" : "120")
    await expect.poll(() => canvas.evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data
      let colored = 0
      for (let index = 0; index < pixels.length; index += 4)
        if (pixels[index] === 58 && pixels[index + 1] === 143 && pixels[index + 2] === 117) colored++
      return colored
    })).toBeGreaterThan(20)
    await page.screenshot({ path: info.outputPath("graph-default.png") })

    await size.focus()
    await page.keyboard.press("End")
    await expect(size).toHaveValue("1.6")
    await distance.focus()
    await page.keyboard.press("ArrowRight")
    await repulsion.focus()
    await page.keyboard.press("ArrowRight")
    await expect(distance).toHaveValue(cached ? "100" : "75")
    await expect(repulsion).toHaveValue(cached ? "260" : "130")
    await page.getByRole("button", { name: "图谱参数", exact: true }).click()
    await page.getByRole("button", { name: "图谱参数", exact: true }).click()
    await expect(size).toHaveValue("1.6")

    await page.reload()
    await expect(canvas).toBeVisible()
    await page.getByRole("button", { name: "图谱参数", exact: true }).click()
    await expect(size).toHaveValue("0.65")
    await expect(distance).toHaveValue(cached ? "100" : "75")
    await expect(repulsion).toHaveValue(cached ? "260" : "130")
    await size.focus()
    await page.keyboard.press("End")
    await expect(size).toHaveValue("1.6")
    await page.getByRole("button", { name: "AI Wiki", exact: true }).click()
    await expect(page.getByRole("heading", { name: "DeepInsight Wiki", exact: true })).toBeVisible()
    await page.getByText(notebook.name, { exact: true }).click()
    await expect(canvas).toBeVisible()
    await page.getByRole("button", { name: "图谱参数", exact: true }).click()
    await expect(size).toHaveValue("0.65")
    await expect(distance).toHaveValue(cached ? "100" : "75")
    await expect(repulsion).toHaveValue(cached ? "260" : "130")
    expect(errors).toEqual([])
  })
}
