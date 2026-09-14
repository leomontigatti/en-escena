import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { choreographyDancers } from "./choreographies";
import { createTable } from "./core";
import { events, seminarInscriptions } from "./events";

export const paymentMethod = pgEnum("en_escena_finance_payment_method", [
  "transferencia",
  "efectivo",
  "mercado_pago",
  "otro",
]);

export const payments = createTable(
  "payment",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: varchar("event_id", { length: 255 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    academyId: varchar("academy_id", { length: 255 })
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    paymentNumber: integer("payment_number").notNull(),
    paymentDate: text("payment_date").notNull(),
    amount: integer("amount").notNull(),
    paymentMethod: paymentMethod("payment_method").notNull(),
    reference: text("reference"),
    internalNote: text("internal_note"),
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
    uniqueIndex("payment_event_number_unique").on(
      table.eventId,
      table.paymentNumber,
    ),
    index("payment_event_academy_idx").on(
      table.eventId,
      table.academyId,
      table.createdAt,
    ),
  ],
).enableRLS();

export const paymentAllocations = createTable(
  "payment_allocation",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    paymentId: varchar("payment_id", { length: 255 }).notNull(),
    // The allocation target: exactly one of the two is set, and which one is
    // set is the kind of inscription the money sits on. Both are nullable so
    // the pair can carry the constraint; `payment_allocation_exactly_one_target`
    // is what makes "exactly one" true rather than "at most one".
    choreographyInscriptionId: varchar("choreography_inscription_id", {
      length: 255,
    }),
    seminarInscriptionId: varchar("seminar_inscription_id", { length: 255 }),
    academyId: varchar("academy_id", { length: 255 }).notNull(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    // Money against an inscription, with no role. There is at most one row per
    // (payment, target): it is written by a summing upsert, and deleted when a
    // decrement leaves it at zero.
    amount: integer("amount").notNull(),
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
  // The foreign keys are named because the name Drizzle derives from this table
  // exceeds Postgres's 63-character identifier limit and gets truncated. The names
  // must match those in the baseline migration in app/db/migrations.
  (table) => [
    foreignKey({
      columns: [table.paymentId],
      foreignColumns: [payments.id],
      name: "payment_allocation_payment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.choreographyInscriptionId],
      foreignColumns: [choreographyDancers.id],
      name: "payment_allocation_choreography_inscription_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.seminarInscriptionId],
      foreignColumns: [seminarInscriptions.id],
      name: "payment_allocation_seminar_inscription_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.academyId],
      foreignColumns: [academies.id],
      name: "payment_allocation_academy_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "payment_allocation_event_fk",
    }).onDelete("cascade"),
    // A `unique()` constraint rather than a `uniqueIndex()`, because Drizzle can
    // only express `NULLS NOT DISTINCT` on the former. The clause is what keeps
    // the summing upsert to a single conflict target: without it, Postgres would
    // treat every null target column as distinct and each allocation of the same
    // (payment, inscription) pair would insert a new row instead of summing.
    unique("payment_allocation_payment_target_unique")
      .on(
        table.paymentId,
        table.choreographyInscriptionId,
        table.seminarInscriptionId,
      )
      .nullsNotDistinct(),
    check("payment_allocation_amount_positive", sql`${table.amount} > 0`),
    check(
      "payment_allocation_exactly_one_target",
      sql`num_nonnulls(${table.choreographyInscriptionId}, ${table.seminarInscriptionId}) = 1`,
    ),
    index("payment_allocation_choreography_inscription_idx").on(
      table.choreographyInscriptionId,
      table.createdAt,
    ),
    index("payment_allocation_seminar_inscription_idx").on(
      table.seminarInscriptionId,
      table.createdAt,
    ),
    index("payment_allocation_payment_idx").on(
      table.paymentId,
      table.createdAt,
    ),
    index("payment_allocation_event_academy_idx").on(
      table.eventId,
      table.academyId,
      table.createdAt,
    ),
  ],
).enableRLS();
