import { createMemo, type Accessor, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import type { DockApiCaseSnapshot } from "@/context/dockapi"
import type { AgentArtifactSource } from "../agent-workbench/artifact-source"
import { createCaseSnapshotReplay } from "../agent-workbench/snapshot-replay"
import { createReportLength } from "../agent-workbench/report-length-context"
import {
  buildCaseSnapshotWorkbench,
  caseSnapshotNestedSessions,
  caseSnapshotTranscripts,
} from "../agent-workbench/snapshot"
import { deepInsightCatalogArtifacts, deepInsightProgress } from "./data"
import { createDeepInsightRoute } from "./route-context"
import { DEEPINSIGHT_ARTIFACT_ROLES, DEEPINSIGHT_MEMBERS } from "./config"
import { DeepInsightWorkbenchValueProvider, type DeepInsightWorkbenchContextValue } from "./workbench-context"

const MEMBER_IDS = new Set(DEEPINSIGHT_MEMBERS.map((member) => member.id))

export function DeepInsightSnapshotWorkbenchProvider(
  props: ParentProps<{
    snapshot: Accessor<DockApiCaseSnapshot>
    artifactSource: AgentArtifactSource
  }>,
) {
  const [state, setState] = createStore({ selectedAgentId: "overview" })
  const snapshotData = createMemo(() =>
    buildCaseSnapshotWorkbench({
      snapshot: props.snapshot(),
      members: DEEPINSIGHT_MEMBERS,
      roles: DEEPINSIGHT_ARTIFACT_ROLES,
      selectedAgentId: "overview",
      artifacts: (discovery) => ({
        ...discovery,
        artifacts: deepInsightCatalogArtifacts(discovery.artifacts, [
          ...caseSnapshotTranscripts(props.snapshot()).values(),
        ]),
      }),
    }),
  )
  const actualWorkbench = createMemo(() => {
    const source = snapshotData().workbench
    return {
      ...source,
      nestedAgentSessions: caseSnapshotNestedSessions(snapshotData(), state.selectedAgentId),
      stats: {
        ...source.stats,
        uniqueSearchUrlCount: 0,
      },
    }
  })
  const controller = createCaseSnapshotReplay({
    workbench: actualWorkbench,
    selectedAgentId: () => state.selectedAgentId,
    selectOverview: () => setState("selectedAgentId", "overview"),
    artifactSource: props.artifactSource,
  })

  const reportLength = createReportLength({
    scope: () => JSON.stringify([props.snapshot().caseCode, props.snapshot().capturedAt]),
    report: () => actualWorkbench().artifacts.find((artifact) => artifact.path === actualWorkbench().textReportPath),
    source: props.artifactSource,
    replaying: controller.replay.isReplaying,
    replayMarkdown: controller.replay.textReportMarkdown,
  })

  const researchRoute = createDeepInsightRoute({
    path: () => actualWorkbench().artifacts.find((item) => item.filename === "00-execution-trace.json")?.path,
    revision: () => props.snapshot().capturedAt,
    source: props.artifactSource,
  })

  const value: DeepInsightWorkbenchContextValue = {
    workbench: controller.workbench,
    reportLength,
    progressPercent: () =>
      deepInsightProgress(
        controller.workbench().agents,
        researchRoute(),
        controller.workbench().overviewStatus === "running" ||
          !controller.workbench().artifacts.some((item) => item.filename === "35-report.pdf"),
      ),
    selectedAgentId: () => state.selectedAgentId,
    selectAgent(agentId) {
      if (agentId !== "overview" && !MEMBER_IDS.has(agentId)) return
      setState("selectedAgentId", agentId)
    },
    retrySession: () => Promise.resolve(),
    artifactSource: props.artifactSource,
    replay: controller.replay,
  }

  return <DeepInsightWorkbenchValueProvider value={value}>{props.children}</DeepInsightWorkbenchValueProvider>
}
