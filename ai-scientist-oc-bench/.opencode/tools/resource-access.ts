import { tool } from "@opencode-ai/plugin"
import { diagnose } from "../lib/resource-access.mjs"
export default tool({
 description: "Diagnose public resource access and suggest concrete recovery routes. HEAD only; no credentials or signed URLs.",
 args: {url: tool.schema.string(), kind: tool.schema.enum(["model","data","code","other"]), external_access_allowed: tool.schema.boolean().describe("True only after current task permits network access"), ipv4: tool.schema.boolean().optional()},
 async execute(args) { return JSON.stringify(await diagnose(args), null, 2) },
})
