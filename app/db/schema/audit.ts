import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  jsonb,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { user } from "./access";
import {
  administrativeAuditAction,
  administrativeAuditEntityType,
  createTable,
} from "./core";
import { events } from "./events";

export const administrativeAuditEntries = createTable(
  "administrative_audit_entry",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    entityType: administrativeAuditEntityType("entity_type").notNull(),
    entityId: varchar("entity_id", { length: 255 }).notNull(),
    eventId: varchar("event_id", { length: 255 }),
    adminUserId: varchar("admin_user_id", { length: 255 }).notNull(),
    action: administrativeAuditAction("action").notNull(),
    reason: text("reason"),
    beforeValues: jsonb("before_values")
      .$type<Record<string, unknown>>()
      .notNull(),
    afterValues: jsonb("after_values")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("administrative_audit_entry_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "audit_entry_event_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.adminUserId],
      foreignColumns: [user.id],
      name: "audit_entry_admin_user_fk",
    }).onDelete("cascade"),
    index("administrative_audit_entry_event_idx").on(table.eventId),
    index("administrative_audit_entry_admin_user_idx").on(table.adminUserId),
  ],
).enableRLS();
