import { createMemo, createEffect, type Accessor, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import type { DockApiCaseSnapshot } from "@/context/dockapi"
import type { AgentArtifactSource } from "../agent-workbench/artifact-source"
import { caseSnapshotTranscripts, caseSnapshotArtifacts } from "../agent-workbench/snapshot"
import { createCaseSnapshotReplay } from "../agent-workbench/snapshot-replay"
import { createReportLength } from "../agent-workbench/report-length-context"
import { MSTOCK_ARTIFACT_ROLES } from "./config"
import { mstockWorkbench, mstockProgress } from "./data"
import { MstockWorkbenchValueProvider, type MstockWorkbenchContextValue } from "./workbench-context"

export function MstockSnapshotWorkbenchProvider(
  props: ParentProps<{ snapshot: Accessor<DockApiCaseSnapshot>; artifactSource: AgentArtifactSource }>,
) {
  const [state, setState] = createStore({ selected: "overview" })
  const actual = createMemo(() => {
    const transcripts = caseSnapshotTranscripts(props.snapshot())
    const artifacts = caseSnapshotArtifacts(props.snapshot(), transcripts, MSTOCK_ARTIFACT_ROLES)
    return mstockWorkbench({
      rootId: props.snapshot().rootSessionId,
      transcripts: [...transcripts.values()],
      files: artifacts.artifacts,
      selected: state.selected,
      warnings: artifacts.ambiguities,
    })
  })
  const controller = createCaseSnapshotReplay({
    workbench: actual,
    selectedAgentId: () => state.selected,
    selectOverview: () => setState("selected", "overview"),
    artifactSource: props.artifactSource,
  })
  const reportLength = createReportLength({
    filename: "20-comparison-report.md",
    scope: () => `${props.snapshot().caseCode}:${props.snapshot().capturedAt}`,
    report: () => actual().artifacts.find((file) => file.path === actual().textReportPath),
    source: props.artifactSource,
    replaying: controller.replay.isReplaying,
    replayMarkdown: controller.replay.textReportMarkdown,
  })
  createEffect(() => {
    if (actual().visualReportPath) void props.artifactSource.load(actual().visualReportPath!)
  })
  const value: MstockWorkbenchContextValue = {
    workbench: controller.workbench,
    reportLength,
    selectedAgentId: () => state.selected,
    selectAgent: (id) => setState("selected", id),
    retrySession: async () => {},
    artifactSource: props.artifactSource,
    replay: controller.replay,
    progressPercent: () => {
      const data = controller.workbench()
      return mstockProgress(
        data,
        data.overviewStatus === "completed" &&
          !!data.textReportPath &&
          !!data.visualReportPath &&
          !!props.artifactSource.get(data.textReportPath)?.text &&
          !!props.artifactSource.get(data.visualReportPath)?.text,
      )
    },
  }
  return <MstockWorkbenchValueProvider value={value}>{props.children}</MstockWorkbenchValueProvider>
}
