import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { choreographyDancers } from "./choreographies";
import { createTable } from "./core";
import { events } from "./events";

export const allocationType = pgEnum("en_escena_payment_allocation_type", [
  "deposit",
  "balance",
]);

export const paymentMethod = pgEnum("en_escena_finance_payment_method", [
  "transferencia",
  "efectivo",
  "mercado_pago",
  "otro",
]);

export const eventFinancialSequences = createTable(
  "event_financial_sequence",
  {
    eventId: varchar("event_id", { length: 255 })
      .primaryKey()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    nextPaymentNumber: integer("next_payment_number").notNull().default(1),
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
    index("event_financial_sequence_updated_idx").on(table.updatedAt),
  ],
).enableRLS();

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
    paymentId: varchar("payment_id", { length: 255 })
      .notNull()
      .references(() => payments.id),
    inscriptionId: varchar("inscription_id", { length: 255 })
      .notNull()
      .references(() => choreographyDancers.id, { onDelete: "cascade" }),
    academyId: varchar("academy_id", { length: 255 })
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    eventId: varchar("event_id", { length: 255 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    allocationType: allocationType("allocation_type").notNull(),
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
  (table) => [
    uniqueIndex("payment_allocation_payment_inscription_type_unique").on(
      table.paymentId,
      table.inscriptionId,
      table.allocationType,
    ),
    index("payment_allocation_inscription_idx").on(
      table.inscriptionId,
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
