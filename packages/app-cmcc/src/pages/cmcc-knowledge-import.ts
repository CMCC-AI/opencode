import type { Part, PermissionRuleset } from "@opencode-ai/sdk/v2"

export type KnowledgeImportLiveActivity = {
  label: string
  detail?: string
  updatedAt?: number
}

export type KnowledgeImportExecution = {
  agent: string
  model: {
    providerID: string
    modelID: string
  }
  variant?: string
}

export function knowledgeImportExecution(input: {
  agent?: { name: string }
  model?: { id: string; provider: { id: string } }
  variant?: string
}): KnowledgeImportExecution | undefined {
  if (!input.agent || !input.model) return undefined
  return {
    agent: input.agent.name,
    model: { providerID: input.model.provider.id, modelID: input.model.id },
    variant: input.variant,
  }
}

export function knowledgeImportLiveActivity(parts: Part[]): KnowledgeImportLiveActivity | undefined {
  const part = parts.findLast((item) => item.type === "tool" || item.type === "reasoning" || item.type === "text")
  if (!part) return undefined
  if (part.type === "reasoning") {
    return {
      label: "模型正在分析当前材料",
      detail: compactActivityDetail(part.text),
      updatedAt: part.time?.end ?? part.time?.start,
    }
  }
  if (part.type === "text") {
    return {
      label: part.time?.end ? "模型已生成阶段性结果，正在继续处理" : "模型正在生成处理结果",
      detail: compactActivityDetail(part.text),
      updatedAt: part.time?.end ?? part.time?.start,
    }
  }

  const action = toolActivity(part.tool, part.state.input)
  const status = part.state.status
  return {
    label:
      status === "pending"
        ? `准备${action.label}`
        : status === "running"
          ? `正在${action.label}`
          : status === "completed"
            ? `刚刚完成${action.label}`
            : `${action.label}失败`,
    detail: action.detail,
    updatedAt:
      status === "completed" || status === "error" ? part.state.time.end : status === "running" ? part.state.time.start : undefined,
  }
}

function toolActivity(tool: string, input: Record<string, unknown>) {
  const path = activityPath(input.filePath) ?? activityPath(input.path) ?? activityPath(input.filename)
  if (tool === "read") return { label: "读取文件", detail: path }
  if (tool === "write") return { label: "写入知识页", detail: path }
  if (tool === "edit" || tool === "apply_patch") return { label: "更新知识页", detail: path }
  if (tool === "glob" || tool === "list") return { label: "扫描笔记本文件", detail: path }
  if (tool === "grep") return { label: "检索知识内容", detail: path }
  if (tool === "bash") return { label: "执行校验命令", detail: compactActivityDetail(input.command) }
  if (tool === "skill") return { label: "调用知识库处理能力", detail: compactActivityDetail(input.name) }
  return { label: `执行 ${tool}`, detail: path }
}

function activityPath(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined
  const normalized = value.replaceAll("\\", "/")
  const parts = normalized.split("/").filter(Boolean)
  return parts.slice(-2).join("/") || normalized
}

function compactActivityDetail(value: unknown) {
  if (typeof value !== "string") return undefined
  const text = value.replace(/\s+/g, " ").trim()
  if (!text) return undefined
  return text.length > 120 ? `${text.slice(0, 117)}...` : text
}

export function formatImportDuration(elapsedSeconds: number) {
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  if (minutes === 0) return `${seconds} 秒`
  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`
}

export function knowledgeImportHeartbeat(secondsSinceActivity: number) {
  if (secondsSinceActivity < 15) return "刚刚同步了新进展"
  if (secondsSinceActivity < 60) return `${secondsSinceActivity} 秒前同步进展`
  return "当前步骤耗时较长，正在等待处理结果"
}

export function knowledgeImportPermissions(sourceDirectories: string[] = []): PermissionRuleset {
  return [
    { permission: "external_directory", pattern: "*", action: "deny" },
    ...sourceDirectories.flatMap((directory) => {
      const path = directory.replace(/[\\/]+$/, "")
      return [
        { permission: "external_directory", pattern: path, action: "allow" as const },
        { permission: "external_directory", pattern: `${path}/*`, action: "allow" as const },
      ]
    }),
  ]
}

export function validateImportPrompt(count: number) {
  return `使用 llm-wiki skill 对刚完成的 ${count} 个原始文件执行最终校验：重建 index.md 的全量覆盖，检查 02_LLM_Wiki 中 YAML 必填字段、重复 aliases、失效 [[双链]]、缺失“## 语义连接”的页面，并修复可确定的问题；最后向 log.md 追加 validation 记录。不要重新执行原始文件导入。校验过程不得访问笔记本目录之外的路径，也不得使用 /tmp、/var/tmp 或系统临时目录；优先使用管道、进程替换或内存完成检查，如确需临时文件，只能在当前笔记本内创建并在完成前删除。`
}
