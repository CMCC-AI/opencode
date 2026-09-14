import { DeepInspectResultsPanel } from "@/pages/session/deepinspect/deepinspect-results-panel"
import { DeepInspectSessionView } from "@/pages/session/deepinspect/deepinspect-session-view"
import { DeepInspectSnapshotWorkbenchProvider } from "@/pages/session/deepinspect/snapshot-workbench"
import { DEEPINSPECT_DAG_LEVELS } from "@/pages/session/deepinspect/config"
import { DedicatedCaseLayout, type DedicatedCaseProps } from "../dedicated-case-layout"

export default function InspectionCase(props: DedicatedCaseProps) {
  return (
    <DeepInspectSnapshotWorkbenchProvider snapshot={props.snapshot} artifactSource={props.artifactSource}>
      <DedicatedCaseLayout
        header={props.header}
        persistKey="deepinspect-panels"
        label="DeepInspect"
        dagRows={DEEPINSPECT_DAG_LEVELS.length}
        left={<DeepInspectSessionView />}
        right={<DeepInspectResultsPanel onCreateSame={props.onCreateSame} />}
      />
    </DeepInspectSnapshotWorkbenchProvider>
  )
}
