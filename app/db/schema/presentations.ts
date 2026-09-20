import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { choreographies } from "./choreographies";
import { createTable, uuidPrimaryKey } from "./core";
import { events } from "./events";

/**
 * A choreography's place in the event's order. One row per choreography at
 * most, holding the order number and nothing else about it: the schedule, the
 * category and the group type are read from the choreography itself, so a
 * correction to any of them is visible beside the number immediately. See
 * docs/domain/judging.md, "Participation And Judging".
 *
 * No cascade, matching `choreography`: deleting a numbered choreography deletes
 * its presentation explicitly, in the same transaction.
 */
export const presentations = createTable(
  "presentation",
  {
    id: uuidPrimaryKey(),
    choreographyId: varchar("choreography_id", { length: 255 }).notNull(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    orderNumber: integer("order_number").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    foreignKey({
      columns: [table.choreographyId],
      foreignColumns: [choreographies.id],
      name: "presentation_choreography_fk",
    }),
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "presentation_event_fk",
    }),
    uniqueIndex("presentation_choreography_unique").on(table.choreographyId),
    // Hand-edited in the migration to `DEFERRABLE INITIALLY DEFERRED`, which
    // Drizzle cannot express: renumbering a whole event in place happens inside
    // one transaction and walks through states where two rows share a number.
    // The constraint is still checked, at commit.
    unique("presentation_event_order_unique").on(
      table.eventId,
      table.orderNumber,
    ),
    index("presentation_event_order_idx").on(table.eventId, table.orderNumber),
  ],
).enableRLS();
