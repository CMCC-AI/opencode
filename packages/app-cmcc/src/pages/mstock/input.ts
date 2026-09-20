import type { Prompt } from "@/context/prompt"
export const MSTOCK_DIMENSIONS = ["估值水平", "基本面财务", "技术走势", "主要风险", "催化剂舆情", "成长性", "行业格局"]
export function mstockPrompt(files: Array<{ path: string; title: string; mime: string; url?: string }>): Prompt {
  const mention = "@mstock/mstock"
  const query = `${mention} 请仅基于以下已明确选定的报告和附件完成多股综合对比，直接读取这些文件，不再扫描或自动选择历史报告。所有产物和子任务统一使用系统注入的本次会话产物目录。\n${files.map((file, index) => `${index + 1}. ${file.title}\n文件：${file.path}`).join("\n")}\n按现有多股对比流程完成分析并交付文字报告、HTML 看板及可生成的 PDF。`
  return [
    { type: "agent", name: "mstock/mstock", content: mention, start: 0, end: mention.length },
    { type: "text", content: query.slice(mention.length), start: mention.length, end: query.length },
    ...files.map((file) => ({
      type: "file" as const,
      path: file.path,
      filename: file.title,
      mime: file.mime,
      url: file.url,
      content: "",
      start: query.length,
      end: query.length,
    })),
  ]
}
