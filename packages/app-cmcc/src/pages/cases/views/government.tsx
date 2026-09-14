import { ZhengqiResultsPanel } from "@/pages/session/zhengqi/zhengqi-results-panel"
import { ZhengqiSessionView } from "@/pages/session/zhengqi/zhengqi-session-view"
import { ZhengqiSnapshotWorkbenchProvider } from "@/pages/session/zhengqi/snapshot-workbench"
import { ZHENGQI_DAG_LEVELS } from "@/pages/session/zhengqi/config"
import { DedicatedCaseLayout, type DedicatedCaseProps } from "../dedicated-case-layout"

export default function GovernmentCase(props: DedicatedCaseProps) {
  return (
    <ZhengqiSnapshotWorkbenchProvider snapshot={props.snapshot} artifactSource={props.artifactSource}>
      <DedicatedCaseLayout
        header={props.header}
        persistKey="zhengqi-panels"
        label="DeepEngage"
        dagRows={ZHENGQI_DAG_LEVELS.length}
        left={<ZhengqiSessionView />}
        right={<ZhengqiResultsPanel onCreateSame={props.onCreateSame} />}
      />
    </ZhengqiSnapshotWorkbenchProvider>
  )
}
