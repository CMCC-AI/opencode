import { useDockApi } from "@/context/dockapi"
import { useServer } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { CMCC_TEAM_EXPERTS } from "@/utils/cmcc-experts"
import { cmccArtifactWorkspace } from "@/utils/cmcc-workspace"
import type { ResearchMode } from "./research-attachments"

export function useResearchHome() {
  const dockapi = useDockApi()
  const server = useServer()
  const tabs = useTabs()
  return (mode: ResearchMode = "deep", query?: string) => {
    const expert = CMCC_TEAM_EXPERTS.find((item) => item.id === "deepinsight")
    const directory = dockapi.workspace?.directoryPath
    const artifactDirectory = cmccArtifactWorkspace(directory)
    if (!expert || !directory || !artifactDirectory || !tabs.ready()) return false
    tabs.newDraft(
      { server: server.key, directory, artifactDirectory, expertID: expert.id, researchMode: mode },
      query ?? (mode === "deep" ? expert.defaultPrompt : ""),
      { agent: expert.leadAgent },
    )
    return true
  }
}
