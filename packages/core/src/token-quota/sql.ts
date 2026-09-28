import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import { SessionTable } from "../session/sql"

export const TokenQuotaPolicyTable = sqliteTable("token_quota_policy", {
  user_id: text().primaryKey(),
  daily_limit: integer(),
  monthly_limit: integer(),
  request_limit: integer(),
  overage: text().$type<"reject" | "allow_and_audit">(),
  ...Timestamps,
})

export const TokenQuotaSessionTable = sqliteTable(
  "token_quota_session",
  {
    session_id: text()
      .primaryKey()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    user_id: text().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [index("token_quota_session_user_idx").on(table.user_id)],
)

export const TokenQuotaUsageTable = sqliteTable(
  "token_quota_usage",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    session_id: text()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    request_id: text().notNull(),
    provider_id: text().notNull(),
    model_id: text().notNull(),
    api_key_hash: text(),
    status: text().$type<"reserved" | "settled" | "released">().notNull(),
    reserved_tokens: integer().notNull(),
    input_tokens: integer().notNull().default(0),
    output_tokens: integer().notNull().default(0),
    reasoning_tokens: integer().notNull().default(0),
    cache_read_tokens: integer().notNull().default(0),
    cache_write_tokens: integer().notNull().default(0),
    total_tokens: integer().notNull().default(0),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
    time_settled: integer(),
  },
  (table) => [
    index("token_quota_usage_request_idx").on(table.request_id),
    index("token_quota_usage_user_time_idx").on(table.user_id, table.time_created),
    index("token_quota_usage_session_idx").on(table.session_id),
  ],
)
