import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260928000000_token_quota",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`token_quota_policy\` (
          \`user_id\` text PRIMARY KEY,
          \`daily_limit\` integer,
          \`monthly_limit\` integer,
          \`request_limit\` integer,
          \`overage\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`token_quota_session\` (
          \`session_id\` text PRIMARY KEY,
          \`user_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_token_quota_session_session_id_session_id_fk\`
            FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`token_quota_usage\` (
          \`id\` text PRIMARY KEY,
          \`user_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`request_id\` text NOT NULL,
          \`provider_id\` text NOT NULL,
          \`model_id\` text NOT NULL,
          \`api_key_hash\` text,
          \`status\` text NOT NULL,
          \`reserved_tokens\` integer NOT NULL,
          \`input_tokens\` integer DEFAULT 0 NOT NULL,
          \`output_tokens\` integer DEFAULT 0 NOT NULL,
          \`reasoning_tokens\` integer DEFAULT 0 NOT NULL,
          \`cache_read_tokens\` integer DEFAULT 0 NOT NULL,
          \`cache_write_tokens\` integer DEFAULT 0 NOT NULL,
          \`total_tokens\` integer DEFAULT 0 NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_settled\` integer,
          CONSTRAINT \`fk_token_quota_usage_session_id_session_id_fk\`
            FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`token_quota_session_user_idx\` ON \`token_quota_session\` (\`user_id\`);`)
      yield* tx.run(`CREATE INDEX \`token_quota_usage_request_idx\` ON \`token_quota_usage\` (\`request_id\`);`)
      yield* tx.run(
        `CREATE INDEX \`token_quota_usage_user_time_idx\` ON \`token_quota_usage\` (\`user_id\`,\`time_created\`);`,
      )
      yield* tx.run(`CREATE INDEX \`token_quota_usage_session_idx\` ON \`token_quota_usage\` (\`session_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
