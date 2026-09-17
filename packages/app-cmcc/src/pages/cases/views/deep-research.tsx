import { DeepInsightResultsPanel } from "@/pages/session/deepinsight/deepinsight-results-panel"
import { DeepInsightSessionView } from "@/pages/session/deepinsight/deepinsight-session-view"
import { DeepInsightSnapshotWorkbenchProvider } from "@/pages/session/deepinsight/snapshot-workbench"
import { DEEPINSIGHT_DAG_LEVELS } from "@/pages/session/deepinsight/config"
import { DedicatedCaseLayout, type DedicatedCaseProps } from "../dedicated-case-layout"

export default function DeepResearchCase(props: DedicatedCaseProps) {
  return (
    <DeepInsightSnapshotWorkbenchProvider snapshot={props.snapshot} artifactSource={props.artifactSource}>
      <DedicatedCaseLayout
        header={props.header}
        persistKey="deepinsight-panels"
        label="深度研究"
        dagRows={DEEPINSIGHT_DAG_LEVELS.length}
        left={<DeepInsightSessionView />}
        right={<DeepInsightResultsPanel onCreateSame={props.onCreateSame} />}
      />
    </DeepInsightSnapshotWorkbenchProvider>
  )
}
