import { AiScienceResultsPanel } from "@/pages/session/ai-science/ai-science-results-panel"
import { AiScienceSessionView } from "@/pages/session/ai-science/ai-science-session-view"
import { AiScienceSnapshotWorkbenchProvider } from "@/pages/session/ai-science/snapshot-workbench"
import { AI_SCIENCE_DAG_LEVELS } from "@/pages/session/ai-science/config"
import { DedicatedCaseLayout, type DedicatedCaseProps } from "../dedicated-case-layout"

export default function ScienceCase(props: DedicatedCaseProps) {
  return (
    <AiScienceSnapshotWorkbenchProvider snapshot={props.snapshot} artifactSource={props.artifactSource}>
      <DedicatedCaseLayout
        header={props.header}
        persistKey="ai-for-science-panels"
        label="AI for Science"
        dagRows={AI_SCIENCE_DAG_LEVELS.length}
        left={<AiScienceSessionView />}
        right={<AiScienceResultsPanel onCreateSame={props.onCreateSame} />}
      />
    </AiScienceSnapshotWorkbenchProvider>
  )
}
