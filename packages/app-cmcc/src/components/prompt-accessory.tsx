import type { ProductPromptController } from "@opencode-ai/app"
import { Icon } from "@opencode-ai/ui/icon"
import { useNavigate } from "@solidjs/router"
import { createSignal, Show } from "solid-js"
import { CmccKnowledgePicker } from "@cmcc/components/cmcc-knowledge-picker"
import {
  CmccProfessionalDatabasesDialog,
  type CmccProfessionalDatabase,
} from "@cmcc/components/cmcc-professional-databases"
import { cmccKnowledgeNotebooks } from "@cmcc/utils/cmcc-knowledge"

export function CmccPromptAccessory(props: { controller: ProductPromptController }) {
  const navigate = useNavigate()
  const [knowledge, setKnowledge] = createSignal(false)
  const [databases, setDatabases] = createSignal(false)

  const selectDatabase = (database: CmccProfessionalDatabase) => {
    setDatabases(false)
    props.controller.setText(database.prompt)
    props.controller.restoreFocus()
  }

  return (
    <>
      <div class="flex min-w-0 flex-wrap items-center gap-1 px-1 text-v2-text-text-muted">
        <AccessoryButton icon="link" label="附件" onClick={props.controller.attach} />
        <AccessoryButton icon="mcp" label="专家" onClick={() => navigate("/expert")} />
        <AccessoryButton icon="brain" label="知识库" onClick={() => setKnowledge(true)} />
        <AccessoryButton icon="archive" label="专业数据库" onClick={() => setDatabases(true)} />
        <AccessoryButton icon="task" label="技能" onClick={props.controller.openCommands} />
      </div>
      <Show when={knowledge()}>
        <CmccKnowledgePicker
          notebooks={cmccKnowledgeNotebooks()}
          onClose={() => setKnowledge(false)}
          onManage={() => navigate("/knowledge")}
          onSelect={(notebook) => {
            const prompt = props.controller.text().trim()
            setKnowledge(false)
            navigate(`/knowledge/${notebook.id}/session/new${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ""}`)
          }}
        />
      </Show>
      <Show when={databases()}>
        <CmccProfessionalDatabasesDialog onClose={() => setDatabases(false)} onTry={selectDatabase} />
      </Show>
    </>
  )
}

function AccessoryButton(props: {
  icon: "link" | "mcp" | "brain" | "archive" | "task"
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      class="flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12px] hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
      onClick={props.onClick}
    >
      <Icon name={props.icon} class="size-3.5" />
      <span>{props.label}</span>
    </button>
  )
}
