import type { AgentNodeStatus } from "../agent-workbench/model"

export function isDagEdgeActive(status: AgentNodeStatus | undefined) {
  return status !== undefined && status !== "waiting"
}
