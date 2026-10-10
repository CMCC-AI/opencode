import type { Page } from "@playwright/test"
import type { ResearchCase, ResearchDetail } from "../../src/pages/general-deepinsight/model"
import { latestPayload, reflectionData } from "../../src/pages/general-deepinsight/presentation"
import { array, object } from "../../src/pages/general-deepinsight/model"

export async function prepareReferenceDeepInsight(page: Page, detail: ResearchDetail) {
  const data = detail.conversationData
  const query = latestPayload(data, ["generate_query"])
  const cd = {
    researchPlan: query?.research_plan ?? [],
    interruptHistory: array(data.interruptHistory).map((raw) => {
      const record = object(raw)
      return { ...record, type: object(record.payload).type, status: "confirmed", createdAt: record.confirmedAt }
    }),
    pendingQueries: query?.pending_queries ?? [],
    webSearchRounds: data.steps.filter((step) => step.name === "web_search").map((step) => step.payload),
    reflectionRounds: data.steps
      .filter((step) => step.name === "reflection")
      .map((step) => reflectionData(step.payload)),
    visualReport: data.visualReport,
    visualizationsMap: data.visualizationsMap ?? {},
    vizTablesMap: data.vizTablesMap ?? {},
    wordCountRecommendation: query?.word_count_reason,
    outlineContent: latestPayload(data, ["generate_outline", "enhance_outline"])?.outline
      ? JSON.stringify(latestPayload(data, ["generate_outline", "enhance_outline"])!.outline)
      : "",
  }
  const session = {
    id: 7,
    sessionId: detail.session.id,
    agentType: "DeepInsight",
    title: detail.session.title,
    queryContent: detail.session.query,
    status: "completed",
    isCompleted: true,
    tokenCount: detail.session.tokenCount,
    sourcesCount: detail.session.sourcesCount,
    reportLength: detail.session.reportLength,
    elapsedSeconds: detail.session.elapsedSeconds,
    createdAt: detail.session.createdAt,
    updatedAt: detail.session.updatedAt,
  }
  await page.addInitScript(() => {
    localStorage.setItem("token", "reference-test")
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 7, username: "测试用户", phone: "", isVip: false, remainingQuota: 0 }),
    )
    sessionStorage.setItem("deepinsight-home-prompt-shown", "1")
  })
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith("/api/")) return route.continue()
    const data =
      path === "/api/chat/records"
        ? [session]
        : path.endsWith(`/records/${session.sessionId}`)
          ? { session, conversationData: cd, reportContent: detail.reportContent, dataVersion: 1 }
          : path === "/api/user/profile"
            ? { id: 7, username: "测试用户", phone: "", isVip: false, credits: 0 }
            : []
    return route.fulfill({ json: { code: 200, message: "ok", data } })
  })
  await page.goto(`${process.env.CMCC_REFERENCE_BASE_URL}/chat`)
  await page.getByRole("button", { name: "历史任务", exact: true }).click()
  await page.getByText(detail.session.title, { exact: true }).first().click()
  await page.locator(".chat-container .left-panel .query-header").waitFor()
}

export async function prepareReferenceFeaturedCases(page: Page, cases: ResearchCase[]) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "reference-test")
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 7, username: "测试用户", phone: "", isVip: false, remainingQuota: 0 }),
    )
    sessionStorage.setItem("deepinsight-home-prompt-shown", "1")
  })
  await page.route("**/test-research-cover.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#edf4ff"/><rect x="80" y="80" width="480" height="200" rx="4" fill="#6fa6d6"/></svg>',
    }),
  )
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith("/api/")) return route.continue()
    const data =
      path === "/api/featured-cases"
        ? cases.map((item) => ({ ...item, agentType: "DeepInsight" }))
        : path === "/api/user/profile"
          ? { id: 7, username: "测试用户", phone: "", isVip: false, credits: 0 }
          : []
    return route.fulfill({ json: { code: 200, message: "ok", data } })
  })
  await page.goto(`${process.env.CMCC_REFERENCE_BASE_URL}/chat`)
  await page.locator(".featured-list .featured-card").first().waitFor()
}
