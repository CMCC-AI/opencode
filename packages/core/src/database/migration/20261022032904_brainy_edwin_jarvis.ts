import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261022032904_brainy_edwin_jarvis",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`dockapi_quota_outbox\` (
          \`call_id\` text PRIMARY KEY,
          \`request_json\` text NOT NULL,
          \`finish_json\` text,
          \`dispatched\` integer DEFAULT 0 NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`dockapi_quota_session\` (
          \`session_id\` text PRIMARY KEY,
          \`user_id\` integer NOT NULL,
          \`root_session_id\` text NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`dockapi_quota_outbox_updated_idx\` ON \`dockapi_quota_outbox\` (\`time_updated\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
