import { DeepGeoResultsPanel } from "@/pages/session/deepgeo/deepgeo-results-panel"
import { DeepGeoSessionView } from "@/pages/session/deepgeo/deepgeo-session-view"
import { DeepGeoSnapshotWorkbenchProvider } from "@/pages/session/deepgeo/snapshot-workbench"
import { DEEPGEO_DAG_LEVELS } from "@/pages/session/deepgeo/config"
import { DedicatedCaseLayout, type DedicatedCaseProps } from "../dedicated-case-layout"

export default function LocationCase(props: DedicatedCaseProps) {
  return (
    <DeepGeoSnapshotWorkbenchProvider snapshot={props.snapshot} artifactSource={props.artifactSource}>
      <DedicatedCaseLayout
        header={props.header}
        persistKey="deepgeo-pro-panels"
        label="AI+位置"
        dagRows={DEEPGEO_DAG_LEVELS.length}
        left={<DeepGeoSessionView />}
        right={<DeepGeoResultsPanel onCreateSame={props.onCreateSame} />}
      />
    </DeepGeoSnapshotWorkbenchProvider>
  )
}
