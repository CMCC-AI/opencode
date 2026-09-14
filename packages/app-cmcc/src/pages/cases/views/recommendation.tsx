import { ShoppersResultsPanel } from "@/pages/session/shoppers/shoppers-results-panel"
import { ShoppersSessionView } from "@/pages/session/shoppers/shoppers-session-view"
import { ShoppersSnapshotWorkbenchProvider } from "@/pages/session/shoppers/snapshot-workbench"
import { SHOPPERS_DAG_LEVELS } from "@/pages/session/shoppers/config"
import { DedicatedCaseLayout, type DedicatedCaseProps } from "../dedicated-case-layout"

export default function RecommendationCase(props: DedicatedCaseProps) {
  return (
    <ShoppersSnapshotWorkbenchProvider snapshot={props.snapshot} artifactSource={props.artifactSource}>
      <DedicatedCaseLayout
        header={props.header}
        persistKey="shoppers-pro-panels"
        label="好买手"
        dagRows={SHOPPERS_DAG_LEVELS.length}
        left={<ShoppersSessionView />}
        right={<ShoppersResultsPanel onCreateSame={props.onCreateSame} />}
      />
    </ShoppersSnapshotWorkbenchProvider>
  )
}
