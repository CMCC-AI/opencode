import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260819094512_session-list-indexes",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`DROP INDEX IF EXISTS \`session_project_idx\`;`)
      yield* tx.run(
        `CREATE INDEX \`session_project_directory_parent_updated_idx\` ON \`session\` (\`project_id\`,\`directory\`,\`parent_id\`,\`time_updated\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_directory_parent_updated_id_idx\` ON \`session\` (\`directory\`,\`parent_id\`,\`time_updated\`,\`id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
