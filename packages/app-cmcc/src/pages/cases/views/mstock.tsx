import { MstockResultsPanel } from "@/pages/session/mstock/mstock-results-panel"
import { MstockSessionView } from "@/pages/session/mstock/mstock-session-view"
import { MstockSnapshotWorkbenchProvider } from "@/pages/session/mstock/snapshot-workbench"
import { DedicatedCaseLayout, type DedicatedCaseProps } from "../dedicated-case-layout"
export default function MstockCase(props: DedicatedCaseProps) {
  return (
    <MstockSnapshotWorkbenchProvider snapshot={props.snapshot} artifactSource={props.artifactSource}>
      <DedicatedCaseLayout
        header={props.header}
        persistKey="mstock-panels"
        label="多股对比"
        dagRows={3}
        left={<MstockSessionView />}
        right={<MstockResultsPanel onCreateSame={props.onCreateSame} />}
      />
    </MstockSnapshotWorkbenchProvider>
  )
}
