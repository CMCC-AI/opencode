import { createMemo, type Accessor, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import type { DockApiCaseSnapshot } from "@/context/dockapi"
import type { AgentArtifactSource } from "../agent-workbench/artifact-source"
import { createCaseSnapshotReplay } from "../agent-workbench/snapshot-replay"
import { buildCaseSnapshotWorkbench, caseSnapshotNestedSessions } from "../agent-workbench/snapshot"
import { collectSearchUrlEvents } from "../agent-workbench/statistics"
import { DEEPGEO_ARTIFACT_ROLES, DEEPGEO_MEMBERS } from "./config"
import { DeepGeoWorkbenchValueProvider, type DeepGeoWorkbenchContextValue } from "./workbench-context"

const MEMBER_IDS = new Set(DEEPGEO_MEMBERS.map((member) => member.id))

export function DeepGeoSnapshotWorkbenchProvider(
  props: ParentProps<{
    snapshot: Accessor<DockApiCaseSnapshot>
    artifactSource: AgentArtifactSource
  }>,
) {
  const [state, setState] = createStore({ selectedAgentId: "overview" })
  const snapshotData = createMemo(() =>
    buildCaseSnapshotWorkbench({
      snapshot: props.snapshot(),
      members: DEEPGEO_MEMBERS,
      roles: DEEPGEO_ARTIFACT_ROLES,
      selectedAgentId: "overview",
    }),
  )
  const childTranscripts = createMemo(() => {
    const current = snapshotData()
    return current.children.flatMap((session) => {
      const transcript = current.transcripts.get(session.id)
      return transcript ? [transcript] : []
    })
  })
  const searchUrlEvents = createMemo(() => collectSearchUrlEvents(childTranscripts()))
  const actualWorkbench = createMemo(() => {
    const source = snapshotData().workbench
    return {
      ...source,
      nestedAgentSessions: caseSnapshotNestedSessions(snapshotData(), state.selectedAgentId),
      stats: {
        ...source.stats,
        uniqueSearchUrlCount: new Set(searchUrlEvents().flatMap((event) => event.urls)).size,
      },
    }
  })
  const controller = createCaseSnapshotReplay({
    workbench: actualWorkbench,
    selectedAgentId: () => state.selectedAgentId,
    selectOverview: () => setState("selectedAgentId", "overview"),
    artifactSource: props.artifactSource,
    searchUrlEvents,
  })
  const reportCount = createMemo(() => {
    const value = actualWorkbench().artifacts.filter((artifact) =>
      artifact.filename.toLowerCase().endsWith(".svg"),
    ).length
    return value > 0 ? value : undefined
  })

  const value: DeepGeoWorkbenchContextValue = {
    workbench: controller.workbench,
    reportCount,
    selectedAgentId: () => state.selectedAgentId,
    selectAgent(agentId) {
      if (agentId !== "overview" && !MEMBER_IDS.has(agentId)) return
      setState("selectedAgentId", agentId)
    },
    retrySession: () => Promise.resolve(),
    artifactSource: props.artifactSource,
    replay: controller.replay,
  }

  return <DeepGeoWorkbenchValueProvider value={value}>{props.children}</DeepGeoWorkbenchValueProvider>
}
