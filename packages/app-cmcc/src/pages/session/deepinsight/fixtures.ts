import type { Message, Part, Session } from "@opencode-ai/sdk/v2"
import type { SessionTranscript } from "../agent-workbench/model"
import { DEEPINSIGHT_LEAD_AGENT } from "./page-selection"

// Minimal, anonymized shapes from the two observed runs; times and text are test data.
export function deepInsightFixture(repeated = false, legacy = true, nested = false) {
  const directory = "/workspace/user"
  const rootPath = nested
    ? "runs/test-run/tmp/research-workspace/20260916-1524"
    : legacy
      ? "tmp/research-workspace/20260916-0917"
      : "runs/test-run"
  const stages = [
    ["di-intent-analyst", "01-safety.json"],
    ["di-intent-analyst", "01-requirements.json"],
    ["di-query-planner", "03-plan.json"],
    ["di-web-researcher", "05-web-findings-1.md"],
    ["di-reflector", "07-reflection-1.json"],
    ...(repeated
      ? [
          ["di-web-researcher", "05-web-findings-2.md"],
          ["di-reflector", "07-reflection-2.json"],
        ]
      : []),
    ["di-outline-architect", "10-outline.json"],
    ["di-report-writer", "19-report-part-01.md"],
    ["di-report-writer", "19-report-part-02.md"],
    ["di-report-writer", "19-report-part-03.md"],
    ...(repeated ? [["di-report-writer", "19-report-part-04.md"]] : []),
    ["di-evidence-reviewer", "21-evidence-review-1.json"],
    ...(repeated
      ? [
          ["di-report-writer", "19-report-part-01.md"],
          ["di-evidence-reviewer", "21-evidence-review-2.json"],
        ]
      : []),
    ["di-viz", "25-visual-report.json"],
    ["di-publisher", "30-report.html"],
    ["di-publisher", "35-report.pdf"],
  ]
  const tokens = { input: 10, output: 20, reasoning: 3, cache: { read: 999, write: 999 } }
  const session = (id: string, agent: string, time: number, parentID?: string): Session => ({
    id,
    slug: id,
    title: parentID ? "专家任务" : "深度研究验收",
    agent,
    parentID,
    projectID: "test",
    directory,
    version: "test",
    time: { created: time, updated: time + 80 },
    tokens,
    metadata: parentID ? undefined : { cmccArtifactDirectory: `${directory}/runs/test-run` },
  })
  const user = (value: Session, at: number): Message => ({
    id: `${value.id}-user`,
    sessionID: value.id,
    role: "user",
    agent: value.agent!,
    time: { created: at },
    model: { providerID: "test", modelID: "test" },
  })
  const assistant = (value: Session, at: number): Message => ({
    id: `${value.id}-assistant`,
    sessionID: value.id,
    parentID: `${value.id}-user`,
    role: "assistant",
    agent: value.agent!,
    time: { created: at, completed: at + 80 },
    modelID: "test",
    providerID: "test",
    mode: "test",
    path: { cwd: directory, root: directory },
    cost: 0,
    tokens,
  })
  const root = session("research-root", DEEPINSIGHT_LEAD_AGENT, 1000)
  const rootUser = user(root, 1000)
  const rootAnswer = assistant(root, 1200 + stages.length * 100)
  const rootParts: Part[] = [
    tool(rootAnswer, "input", "write", { filePath: `${directory}/${rootPath}/00-input.json`, content: "{}" }, 1050),
    { id: "root-text", type: "text", sessionID: root.id, messageID: rootAnswer.id, text: "研究总结" },
  ]
  const children = stages.map(([agent, filename], index): SessionTranscript => {
    const at = 1100 + index * 100
    const child = session(`child-${index}`, `deepinsight/${agent}`, at, root.id)
    const query = user(child, at)
    const answer = assistant(child, at + 1)
    rootParts.push(
      tool(rootAnswer, `task-${index}`, "task", { subagent_type: child.agent }, at + 90, { sessionId: child.id }),
    )
    const command =
      filename === "30-report.html"
        ? "render-report.mjs"
        : filename === "35-report.pdf"
          ? "export-report-pdf.mjs"
          : undefined
    const output = command
      ? tool(
          answer,
          `produce-${index}`,
          "bash",
          { command: `node /skills/${command} ${directory}/${rootPath}` },
          at + 50,
        )
      : tool(
          answer,
          `write-${index}`,
          "write",
          { filePath: `${directory}/${rootPath}/${filename}`, content: "测试内容" },
          at + 50,
        )
    return {
      session: child,
      status: { type: "idle" },
      messages: [query, answer],
      parts: {
        [query.id]: [],
        [answer.id]: [
          output,
          { id: `text-${index}`, type: "text", sessionID: child.id, messageID: answer.id, text: `专家输出 ${index}` },
        ],
      },
    }
  })
  rootParts.push(
    tool(
      rootAnswer,
      "assemble",
      "bash",
      { command: `node /skills/report-batches.mjs assemble ${directory}/${rootPath}` },
      1100 + (stages.length - 3) * 100,
    ),
  )
  const transcripts: SessionTranscript[] = [
    {
      session: root,
      status: { type: "idle" },
      messages: [rootUser, rootAnswer],
      parts: {
        [rootUser.id]: [
          { id: "query", type: "text", sessionID: root.id, messageID: rootUser.id, text: "进行深度研究" },
        ],
        [rootAnswer.id]: rootParts,
      },
    },
    ...children,
  ]
  const filenames = [
    "00-input.json",
    "00-execution-trace.json",
    "01-safety.json",
    "01-requirements.json",
    "02-intent.json",
    "03-plan.json",
    "05-web-findings-1.md",
    "05-web-findings-1.meta.json",
    "07-reflection-1.json",
    "10-outline.json",
    "11-writing-plan.json",
    "19-report-part-01.md",
    "19-report-part-02.md",
    "19-report-part-03.md",
    "20-report.md",
    "20-evidence-review-packet-1.json",
    "21-evidence-review-1.json",
    "22-references.json",
    "23-reference-state.json",
    "25-visual-report.json",
    "30-report.html",
    "31-render-state.json",
    "35-report.pdf",
    "36-pdf-export-state.json",
    "40-stats.json",
    ...(repeated
      ? [
          "05-web-findings-2.md",
          "05-web-findings-2.meta.json",
          "07-reflection-2.json",
          "19-report-part-04.md",
          "21-evidence-review-2.json",
        ]
      : []),
  ]
  return { directory, rootPath, root, transcripts, filenames }
}

function tool(
  message: Message,
  id: string,
  name: string,
  input: Record<string, unknown>,
  at: number,
  metadata: Record<string, unknown> = {},
): Part {
  return {
    id,
    sessionID: message.sessionID,
    messageID: message.id,
    type: "tool",
    callID: id,
    tool: name,
    state: { status: "completed", input, output: "ok", title: name, metadata, time: { start: at - 1, end: at } },
  }
}
