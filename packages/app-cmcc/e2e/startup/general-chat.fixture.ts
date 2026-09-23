import type { Page } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { setupHomePage, homeDirectory } from "./home-fixture"
import { mockOpenCodeServer } from "../utils/mock-server"

export async function setupGeneralChat(
  page: Page,
  options: { agentType?: string; agent?: string; parentID?: string; running?: boolean; turns?: number } = {},
) {
  await setupHomePage(page)
  const session = {
    id: "ses_general_chat_style",
    slug: "chat-style",
    projectID: "chat-style",
    directory: homeDirectory,
    title: "整理研究材料与分析步骤",
    agent: options.agent ?? "build",
    parentID: options.parentID,
    version: "v2",
    time: { created: 1000, updated: 3000 },
  }
  const markdown =
    "## 研究结论\n\n这是用于界面验收的示例内容，不是真实研究结果。保留 **重点内容** 和段落层级。\n\n> 先核对材料，再进行分析。\n\n### 执行步骤\n\n1. 整理输入材料\n2. 检查字段与数据范围\n\n```python\nrows = [1, 2, 3]\nprint(sum(rows))\n```\n\n| 指标 | 本次结果 | 说明 |\n| --- | --- | --- |\n| 完整性 | 已核对 | 仅为测试数据 |\n| 来源 | 待复核 | 保留原始记录 |\n\n使用 `research_report.md` 保存结论。"
  const messages = Array.from({ length: options.turns ?? 3 }, (_, index) => {
    const userID = `msg_chat_${index}_user`
    const answerID = `msg_chat_${index}_assistant`
    const user = {
      info: {
        id: userID,
        sessionID: session.id,
        role: "user",
        time: { created: 1000 + index * 100 },
        agent: "build",
        model: { providerID: "alibaba-cn", modelID: "chat-test", variant: "high" },
      },
      parts: [
        {
          id: `user-${index}-text`,
          messageID: userID,
          sessionID: session.id,
          type: "text",
          text: `第 ${index + 1} 个问题：请整理研究材料，说明分析步骤。`,
        },
      ],
    }
    const answer = {
      info: {
        id: answerID,
        parentID: userID,
        sessionID: session.id,
        role: "assistant",
        time: { created: 1001 + index * 100, completed: 1050 + index * 100 },
        agent: "build",
        mode: "build",
        providerID: "alibaba-cn",
        modelID: "chat-test",
        variant: "high",
        path: { cwd: homeDirectory, root: homeDirectory },
        finish: "stop",
        cost: 0.02,
        tokens: { input: 1200, output: 600, reasoning: 100, cache: { read: 0, write: 0 } },
      },
      parts: [
        {
          id: `answer-${index}-tool`,
          messageID: answerID,
          sessionID: session.id,
          type: "tool",
          tool: "bash",
          callID: `call-${index}`,
          state: {
            status: "completed",
            input: { command: 'python -c "print(1 + 2)"', description: "检查研究数据" },
            output: "3\n检查完成",
            title: "检查研究数据",
            metadata: {},
            time: { start: 1001, end: 1002 },
          },
        },
        { id: `answer-${index}-text`, messageID: answerID, sessionID: session.id, type: "text", text: markdown },
      ],
    }
    return [user, answer]
  }).flat()
  let running = options.running ?? false
  let aborts = 0
  const events: unknown[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    if (window !== window.top) return
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[data-timeline-row="AssistantPart"] [data-component="markdown"]')) return
      requestAnimationFrame(() => performance.mark("general-chat-ready"))
      observer.disconnect()
    })
    observer.observe(document, { childList: true, subtree: true })
  })
  await mockOpenCodeServer(page, {
    directory: homeDirectory,
    project: { id: "chat-style", worktree: homeDirectory, time: { created: 1000 } },
    provider: {
      all: [
        {
          id: "alibaba-cn",
          name: "Qwen",
          models: {
            "chat-test": {
              id: "chat-test",
              name: "界面测试模型",
              limit: { context: 200000 },
              variants: { low: {}, medium: {}, high: {} },
            },
          },
        },
      ],
      connected: ["alibaba-cn"],
      default: { "alibaba-cn": "chat-test" },
    },
    sessions: [session],
    pageMessages: () => ({ items: messages }),
    events: () => events.splice(0),
    eventRetry: 50,
  })
  await page.route("**/api/dockapi/sessions", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: [
          {
            id: "business-chat-style",
            agentType: options.agentType ?? "deepinsight",
            title: session.title,
            query: session.title,
            directoryPath: homeDirectory,
            openCodeSessionId: session.id,
            openCodeSession: session,
            openCodeStatus: { type: running ? "busy" : "idle" },
            createdAt: "2026-09-22T00:00:00Z",
            updatedAt: "2026-09-22T00:00:00Z",
          },
        ],
      },
    }),
  )
  await page.route("**/session/status*", (route) =>
    route.fulfill({ json: running ? { [session.id]: { type: "busy" } } : {} }),
  )
  await page.route(`**/session/${session.id}/abort*`, async (route) => {
    aborts++
    running = false
    events.push({ type: "session.status", properties: { sessionID: session.id, status: { type: "idle" } } })
    await route.fulfill({ json: true })
  })
  return {
    session,
    messages,
    events,
    errors,
    aborts: () => aborts,
    href: (baseURL: string) => `/server/${base64Encode(baseURL)}/session/${session.id}`,
  }
}
