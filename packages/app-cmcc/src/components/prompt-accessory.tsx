import type { ProductPromptController } from "@opencode-ai/app"
import { Icon } from "@opencode-ai/ui/icon"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useNavigate } from "@solidjs/router"
import { createSignal, Show } from "solid-js"
import { CmccKnowledgePicker } from "@cmcc/components/cmcc-knowledge-picker"
import {
  CmccProfessionalDatabasesDialog,
  type CmccProfessionalDatabase,
} from "@cmcc/components/cmcc-professional-databases"
import { cmccKnowledgeNotebooks } from "@cmcc/utils/cmcc-knowledge"

export function CmccPromptMenu(props: { controller: ProductPromptController }) {
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
      <DropdownMenu>
        <DropdownMenu.Trigger as="button" type="button" class="grid size-7 place-items-center rounded-md hover:bg-v2-overlay-simple-overlay-hover">
          <Icon name="plus" class="size-4" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="w-[218px]">
            <DropdownMenu.Item onSelect={props.controller.attach}><Icon name="link" />添加文件和图片</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => setDatabases(true)}><Icon name="archive" />专业数据库</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => navigate("/expert")}><Icon name="mcp" />专家</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={props.controller.openCommands}><Icon name="task" />技能</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => setKnowledge(true)}><Icon name="brain" />知识库</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
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
