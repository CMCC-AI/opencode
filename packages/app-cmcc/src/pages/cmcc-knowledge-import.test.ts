import { describe, expect, test } from "bun:test"
import {
  formatImportDuration,
  knowledgeImportHeartbeat,
  knowledgeImportExecution,
  knowledgeImportLiveActivity,
  knowledgeImportPermissions,
  validateImportPrompt,
} from "./cmcc-knowledge-import"

describe("knowledge import permissions", () => {
  test("binds imports to the model selected in the knowledge composer", () => {
    expect(
      knowledgeImportExecution({
        agent: { name: "build" },
        model: { id: "deepseek-v4-pro", provider: { id: "alibaba-cn" } },
        variant: "default",
      }),
    ).toEqual({
      agent: "build",
      model: { providerID: "alibaba-cn", modelID: "deepseek-v4-pro" },
      variant: "default",
    })
    expect(knowledgeImportExecution({ agent: { name: "build" } })).toBeUndefined()
  })

  test("denies external directories for uploaded files", () => {
    expect(knowledgeImportPermissions()).toEqual([
      { permission: "external_directory", pattern: "*", action: "deny" },
    ])
  })

  test("allows only selected source directories for directory imports", () => {
    expect(knowledgeImportPermissions(["/data/source/", "/mnt/archive"])).toEqual([
      { permission: "external_directory", pattern: "*", action: "deny" },
      { permission: "external_directory", pattern: "/data/source", action: "allow" },
      { permission: "external_directory", pattern: "/data/source/*", action: "allow" },
      { permission: "external_directory", pattern: "/mnt/archive", action: "allow" },
      { permission: "external_directory", pattern: "/mnt/archive/*", action: "allow" },
    ])
  })

  test("keeps final validation inside the notebook", () => {
    const prompt = validateImportPrompt(5)
    expect(prompt).toContain("不得使用 /tmp")
    expect(prompt).toContain("只能在当前笔记本内创建")
  })

  test("describes the latest real tool event", () => {
    expect(
      knowledgeImportLiveActivity([
        {
          type: "tool",
          tool: "write",
          state: {
            status: "running",
            input: { filePath: "/knowledge/02_LLM_Wiki/接口规范.md" },
            time: { start: 1000 },
          },
        } as never,
      ]),
    ).toEqual({ label: "正在写入知识页", detail: "02_LLM_Wiki/接口规范.md", updatedAt: 1000 })
  })

  test("reports actual model output instead of rotating canned actions", () => {
    expect(
      knowledgeImportLiveActivity([
        { type: "text", text: "已完成 3 个页面，继续检查双链", time: { start: 1000 } } as never,
      ]),
    ).toEqual({
      label: "模型正在生成处理结果",
      detail: "已完成 3 个页面，继续检查双链",
      updatedAt: 1000,
    })
  })

  test("formats elapsed time and delayed activity honestly", () => {
    expect(formatImportDuration(9)).toBe("9 秒")
    expect(formatImportDuration(69)).toBe("1 分 09 秒")
    expect(knowledgeImportHeartbeat(8)).toBe("刚刚同步了新进展")
    expect(knowledgeImportHeartbeat(35)).toBe("35 秒前同步进展")
    expect(knowledgeImportHeartbeat(90)).toBe("当前步骤耗时较长，正在等待处理结果")
  })
})
