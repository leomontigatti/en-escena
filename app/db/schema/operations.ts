import { sql } from "drizzle-orm";
import { index, pgEnum, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { createTable, uuidPrimaryKey } from "./core";

export const unexpectedErrorSource = pgEnum(
  "en_escena_unexpected_error_source",
  ["server", "client"],
);

/**
 * One unexpected error, server or client, kept 90 days (the scheduled job
 * deletes older rows): what `[server:unexpected]` and `[client:unexpected]`
 * log, so it outlives the container's stdout. Nothing from the request is
 * kept: no param value, query string, body or header.
 *
 * `signature` names the bug, so its rows group and its alerts are throttled;
 * `alertedAt` marks the row that sent a Telegram alert. `userId` carries no
 * foreign key: writing the row is the error path, and it must not fail on a
 * user deleted since.
 */
export const unexpectedErrors = createTable(
  "unexpected_error",
  {
    id: uuidPrimaryKey(),
    source: unexpectedErrorSource("source").notNull(),
    signature: varchar("signature", { length: 64 }).notNull(),
    route: text("route").notNull(),
    method: varchar("method", { length: 16 }),
    userId: varchar("user_id", { length: 255 }),
    release: varchar("release", { length: 64 }).notNull(),
    stack: text("stack").notNull(),
    alertedAt: timestamp("alerted_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("unexpected_error_signature_created_at_idx").on(
      table.signature,
      table.createdAt,
    ),
    index("unexpected_error_created_at_idx").on(table.createdAt),
  ],
).enableRLS();
