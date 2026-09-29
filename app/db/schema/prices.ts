import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { createTable, groupType } from "./core";
import { events, schedules } from "./events";

// A choreography `price` row and the schedules a special one covers.

export const prices = createTable(
  "price",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    eventId: varchar("event_id", { length: 255 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    // Retired: the schedules a special price covers live in `price_schedule`
    // since migration 0036, which copied this column there. Nothing reads or
    // writes it any more; it waits for its contract step.
    retiredScheduleId: varchar("schedule_id", { length: 255 }),
    // Which tier the row belongs to: a special row prices the schedules its
    // `price_schedule` links name, a general one every choreography of its
    // group type. The flag rather than the absence of links is what the general
    // tier's unique index can read.
    isSpecialPrice: boolean("is_special_price").notNull().default(false),
    groupType: groupType("group_type").notNull(),
    paymentDeadline: text("payment_deadline"),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("price_event_id_idx").on(table.eventId),
    // Created with `NULLS NOT DISTINCT` by migration 0036, so the one
    // deadline-less general price per group type collides with itself. Drizzle
    // can only express that on a `unique()` constraint, and this one cannot be
    // one: it is partial.
    uniqueIndex("price_general_unique")
      .on(table.eventId, table.groupType, table.paymentDeadline)
      .where(sql`not ${table.isSpecialPrice}`),
  ],
).enableRLS();

// One schedule a special price covers. `groupType` and `paymentDeadline` are
// copies of the price's, rewritten with the links on every save, so that the
// unique constraint can refuse two special prices of one group type and
// deadline on the same schedule — the collision the schedule tier would
// otherwise settle by amount, a rule nobody authored.
export const priceSchedules = createTable(
  "price_schedule",
  {
    priceId: varchar("price_id", { length: 255 }).notNull(),
    scheduleId: varchar("schedule_id", { length: 255 }).notNull(),
    groupType: groupType("group_type").notNull(),
    paymentDeadline: text("payment_deadline"),
  },
  (table) => [
    primaryKey({
      columns: [table.priceId, table.scheduleId],
      name: "price_schedule_pk",
    }),
    foreignKey({
      columns: [table.priceId],
      foreignColumns: [prices.id],
      name: "price_schedule_price_fk",
    }).onDelete("cascade"),
    // No `on delete`: a schedule some price covers cannot be deleted, which is
    // what the schedule repository refuses with a typed failure first.
    foreignKey({
      columns: [table.scheduleId],
      foreignColumns: [schedules.id],
      name: "price_schedule_schedule_fk",
    }),
    index("price_schedule_schedule_id_idx").on(table.scheduleId),
    unique("price_schedule_tier_unique")
      .on(table.scheduleId, table.groupType, table.paymentDeadline)
      .nullsNotDistinct(),
  ],
).enableRLS();
