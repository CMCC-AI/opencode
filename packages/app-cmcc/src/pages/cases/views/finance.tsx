import { DeepTradingResultsPanel } from "@/pages/session/deeptrading/deeptrading-results-panel"
import { DeepTradingSessionView } from "@/pages/session/deeptrading/deeptrading-session-view"
import { DeepTradingSnapshotWorkbenchProvider } from "@/pages/session/deeptrading/snapshot-workbench"
import { DedicatedCaseLayout, type DedicatedCaseProps } from "../dedicated-case-layout"

export default function FinanceCase(props: DedicatedCaseProps) {
  return (
    <DeepTradingSnapshotWorkbenchProvider snapshot={props.snapshot} artifactSource={props.artifactSource}>
      <DedicatedCaseLayout
        header={props.header}
        left={<DeepTradingSessionView />}
        right={<DeepTradingResultsPanel />}
      />
    </DeepTradingSnapshotWorkbenchProvider>
  )
}
