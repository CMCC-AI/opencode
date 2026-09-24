import { tool } from "@opencode-ai/plugin"
import z from "zod"
import fs from "node:fs"
import path from "node:path"

export default tool({
  description: "检查 DeepGeo Workspace 产物是否存在、路径是否越界、JSON 是否可解析，以及数据模式是否明确；不修改任何业务内容。",
  args: {
    workspace: z.string(),
    required_files: z.array(z.string()).min(1),
    require_data_mode: z.boolean().default(true),
  },
  async execute(args) {
    const root = path.resolve(args.workspace)
    const problems: string[] = []
    for (const relative of args.required_files) {
      const target = path.resolve(root, relative)
      if (!target.startsWith(root + path.sep)) { problems.push(`${relative}：路径越界`); continue }
      if (!fs.existsSync(target)) { problems.push(`${relative}：文件不存在`); continue }
      if (target.endsWith(".json")) {
        try {
          const payload = JSON.parse(fs.readFileSync(target, "utf8"))
          if (args.require_data_mode && relative !== "00-control/execution-trace.json" && !payload.data_mode && !payload.scenario) {
            problems.push(`${relative}：缺少 data_mode`)
          }
        } catch { problems.push(`${relative}：JSON 无法解析`) }
      }
    }
    return problems.length ? `校验状态：未通过\n- ${problems.join("\n- ")}` : `校验状态：通过；已检查 ${args.required_files.length} 个产物。`
  },
})
