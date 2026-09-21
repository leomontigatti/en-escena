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

import { user } from "./access";
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

/**
 * A judge put on a presentation. It holds the pair and nothing else: no event
 * — the presentation names it — and no record of who assigned, which nobody
 * has asked to read. See docs/domain/judging.md, "Participation And Judging".
 *
 * No cascade, matching its neighbours: deleting a choreography deletes its
 * presentation's assignments explicitly, in the same transaction.
 */
export const judgeAssignments = createTable(
  "judge_assignment",
  {
    id: uuidPrimaryKey(),
    presentationId: varchar("presentation_id", { length: 255 }).notNull(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    foreignKey({
      columns: [table.presentationId],
      foreignColumns: [presentations.id],
      name: "judge_assignment_presentation_fk",
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "judge_assignment_user_fk",
    }),
    uniqueIndex("judge_assignment_presentation_user_unique").on(
      table.presentationId,
      table.userId,
    ),
    index("judge_assignment_user_idx").on(table.userId),
  ],
).enableRLS();
