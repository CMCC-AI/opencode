import type { Message, Part, Session } from "@opencode-ai/sdk/v2"
import type { SessionTranscript } from "../agent-workbench/model"
import { MSTOCK_LEAD_AGENT, MSTOCK_MEMBERS } from "./config"

// Anonymized shapes from the two September 17 runs. Contents and times are test data.
export function mstockFixture(legacy = false) {
  const directory = "/workspace/user"
  const rootPath = legacy ? "tmp/comparison-workspace/20260917-1202" : "runs/comparison-test"
  const tokens = { input: 10, output: 20, reasoning: 3, cache: { read: 999, write: 999 } }
  const entry = (id: string, agent: string, at: number, parentID?: string): SessionTranscript => {
    const session: Session = {
      id,
      slug: id,
      title: parentID ? "执行专家" : "多股对比验收",
      projectID: "test",
      version: "test",
      directory,
      agent,
      parentID,
      time: { created: at, updated: at + 90 },
      tokens,
      metadata: parentID ? undefined : { cmccArtifactDirectory: `${directory}/runs/comparison-test` },
    }
    const user: Message = {
      id: `${id}-u`,
      sessionID: id,
      role: "user",
      time: { created: at },
      agent,
      model: { providerID: "test", modelID: "test" },
    }
    const assistant: Message = {
      id: `${id}-a`,
      sessionID: id,
      parentID: user.id,
      role: "assistant",
      agent,
      time: { created: at + 1, completed: at + 90 },
      modelID: "test",
      providerID: "test",
      mode: "build",
      path: { cwd: directory, root: directory },
      cost: 0,
      tokens,
      finish: "stop",
    }
    return {
      session,
      status: { type: "idle" },
      messages: [user, assistant],
      parts: {
        [user.id]: [
          {
            id: `${id}-q`,
            type: "text",
            sessionID: id,
            messageID: user.id,
            text: parentID ? "执行对比阶段" : "比较两份已完成的报告",
          },
        ],
        [assistant.id]: [
          {
            id: `${id}-text`,
            type: "text",
            sessionID: id,
            messageID: assistant.id,
            text: parentID ? "执行专家结论" : "对比报告已完成",
          },
        ],
      },
    }
  }
  const root = entry("mstock-root", "build", 1000)
  const lead = entry("mstock-lead", MSTOCK_LEAD_AGENT, 1100, root.session.id)
  const workers = MSTOCK_MEMBERS.map((member, index) =>
    entry(`worker-${index}`, member.id, 1200 + index * 100, lead.session.id),
  )
  root.parts[root.messages[0].id] = [
    ...root.parts[root.messages[0].id]!,
    {
      id: "mention",
      type: "agent",
      sessionID: root.session.id,
      messageID: root.messages[0].id,
      name: MSTOCK_LEAD_AGENT,
    },
  ]
  function tool(
    owner: SessionTranscript,
    id: string,
    name: string,
    input: Record<string, unknown>,
    at: number,
    metadata: Record<string, unknown> = {},
  ) {
    const message = owner.messages[1]
    const part: Part = {
      id,
      sessionID: owner.session.id,
      messageID: message.id,
      type: "tool",
      tool: name,
      callID: id,
      state: { status: "completed", title: name, input, output: "ok", metadata, time: { start: at - 1, end: at } },
    }
    owner.parts[message.id] = [...owner.parts[message.id]!, part]
    return part
  }
  tool(root, "lead-task", "task", { subagent_type: MSTOCK_LEAD_AGENT }, 1900, { sessionId: lead.session.id })
  workers.forEach((worker, index) =>
    tool(lead, `worker-task-${index}`, "task", { subagent_type: worker.session.agent }, 1300 + index * 100, {
      sessionId: worker.session.id,
    }),
  )
  const failed = tool(lead, "unprefixed", "task", { subagent_type: "ms-comparator" }, 1150)
  if (failed.type === "tool")
    failed.state = {
      status: "error",
      input: { subagent_type: "ms-comparator" },
      error: "Agent not found",
      time: { start: 1149, end: 1150 },
    }
  for (const filename of ["00-input.json", "01-sources.json", "30-visual-report.json"])
    tool(lead, filename, "write", { filePath: `${directory}/${rootPath}/${filename}`, content: "{}" }, 1510)
  tool(
    workers[0],
    "matrix",
    "write",
    { filePath: `${directory}/${rootPath}/10-comparison-matrix.md`, content: "matrix" },
    1280,
  )
  tool(
    workers[1],
    "report",
    "write",
    { filePath: `${directory}/${rootPath}/20-comparison-report.md`, content: "# 对比报告\n\n最终对比正文" },
    1380,
  )
  tool(lead, "html", "bash", { command: `python3 /skills/render_html.py ${directory}/${rootPath}` }, 1600)
  tool(
    lead,
    "pdf",
    "bash",
    {
      command: `node /skills/export-report-pdf.mjs ${directory}/${rootPath}/40-comparison-report.html ${directory}/${rootPath}/45-comparison-report.pdf`,
    },
    1700,
  )
  tool(lead, "stats", "bash", { command: `python3 /skills/stats.py ${directory}/${rootPath}` }, 1800)
  for (const item of [root, lead]) {
    item.session.time.updated = 1990
    const answer = item.messages[1]
    if (answer.role === "assistant") answer.time.completed = 1990
  }
  const filenames = [
    "00-input.json",
    "01-sources.json",
    "10-comparison-matrix.md",
    "20-comparison-report.md",
    "30-visual-report.json",
    "40-comparison-report.html",
    "45-comparison-report.pdf",
    "50-stats.json",
  ]
  return { directory, rootPath, root: root.session, transcripts: [root, lead, ...workers], filenames }
}
