import { useDockApi } from "@/context/dockapi"
import { useServer } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { CMCC_DEFAULT_RESEARCH_EXPERT } from "@/utils/cmcc-experts"
import { cmccArtifactWorkspace } from "@/utils/cmcc-workspace"
import type { ResearchMode } from "./research-attachments"

export function useResearchHome() {
  const dockapi = useDockApi()
  const server = useServer()
  const tabs = useTabs()
  return (mode: ResearchMode = "deep", query?: string) => {
    const expert = CMCC_DEFAULT_RESEARCH_EXPERT
    const directory = dockapi.workspace?.directoryPath
    const artifactDirectory = cmccArtifactWorkspace(directory)
    if (!expert || !directory || !artifactDirectory || !tabs.ready()) return false
    tabs.newDraft(
      { server: server.key, directory, artifactDirectory, homeTeamPicker: true, expertID: expert.id, researchMode: mode },
      query ?? (mode === "deep" ? expert.defaultPrompt : ""),
      { agent: expert.leadAgent },
    )
    return true
  }
}
