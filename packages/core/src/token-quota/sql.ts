import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

// These tables contain identity and delivery state, never the authoritative quota balance.
export const QuotaSessionTable = sqliteTable("dockapi_quota_session", {
  session_id: text().primaryKey(),
  user_id: integer().notNull(),
  root_session_id: text().notNull(),
})

export const QuotaOutboxTable = sqliteTable(
  "dockapi_quota_outbox",
  {
    call_id: text().primaryKey(),
    request_json: text().notNull(),
    finish_json: text(),
    dispatched: integer().notNull().default(0),
    time_updated: integer().notNull(),
  },
  (table) => [index("dockapi_quota_outbox_updated_idx").on(table.time_updated)],
)
