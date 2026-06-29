import { sql } from "drizzle-orm";
import {
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { user } from "./access";
import { createTable, financePaymentMethod } from "./core";
import { events } from "./events";

export const eventFinancialSequences = createTable(
  "event_financial_sequence",
  {
    eventId: varchar("event_id", { length: 255 })
      .primaryKey()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    nextPaymentNumber: integer("next_payment_number").notNull().default(1),
    nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
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

export const academyEventPayments = createTable(
  "academy_event_payment",
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
    paymentMethod: financePaymentMethod("payment_method").notNull(),
    reference: text("reference"),
    internalNote: text("internal_note"),
    annulledAt: timestamp("annulled_at", {
      mode: "date",
      withTimezone: true,
    }),
    annulledReason: text("annulled_reason"),
    createdByUserId: varchar("created_by_user_id", { length: 255 })
      .notNull()
      .references(() => user.id),
    annulledByUserId: varchar("annulled_by_user_id", {
      length: 255,
    }).references(() => user.id),
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
    uniqueIndex("academy_event_payment_event_number_unique").on(
      table.eventId,
      table.paymentNumber,
    ),
    index("academy_event_payment_event_academy_idx").on(
      table.eventId,
      table.academyId,
      table.createdAt,
    ),
  ],
).enableRLS();
