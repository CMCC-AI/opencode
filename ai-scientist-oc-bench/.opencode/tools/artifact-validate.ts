import { tool } from "@opencode-ai/plugin"
import z from "zod"
import fs from "node:fs"
import path from "node:path"

export default tool({
  description: "Validate required files in a workspace and parse JSON files.",
  args: { workspace: z.string(), required_files: z.array(z.string()).min(1) },
  async execute(args) {
    const root = path.resolve(args.workspace)
    const problems: string[] = []
    for (const relative of args.required_files) {
      const target = path.resolve(root, relative)
      if (!target.startsWith(root + path.sep)) problems.push(`${relative}: path is outside the workspace`)
      else if (!fs.existsSync(target)) problems.push(`${relative}: file not found`)
      else if (target.endsWith(".json")) {
        try { JSON.parse(fs.readFileSync(target, "utf8")) } catch { problems.push(`${relative}: invalid JSON`) }
      }
    }
    return problems.length ? `Validation failed:\n- ${problems.join("\n- ")}` : `Validation passed. Checked ${args.required_files.length} file(s).`
  },
})
