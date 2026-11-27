import { tool } from "@opencode-ai/plugin"
import z from "zod"
import fs from "node:fs"
import path from "node:path"

export default tool({
  description: "检查科研 workspace 中必需产物是否存在、JSON 是否可解析，并用中文报告缺失项；不修改或补造任何科研内容。",
  args: { workspace: z.string(), required_files: z.array(z.string()).min(1) },
  async execute(args) {
    const root = path.resolve(args.workspace)
    const problems: string[] = []
    for (const relative of args.required_files) {
      const target = path.resolve(root, relative)
      if (!target.startsWith(root + path.sep)) { problems.push(`${relative}：路径越界`); continue }
      if (!fs.existsSync(target)) { problems.push(`${relative}：文件不存在`); continue }
      if (target.endsWith(".json")) { try { JSON.parse(fs.readFileSync(target, "utf8")) } catch { problems.push(`${relative}：JSON 无法解析`) } }
    }
    return problems.length ? `校验状态：未通过\n问题：\n- ${problems.join("\n- ")}` : `校验状态：通过\n已检查 ${args.required_files.length} 个必需产物。`
  },
})
