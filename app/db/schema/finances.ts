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
import { user } from "./access";
import { choreographies } from "./choreographies";
import { createTable } from "./core";
import { events, prices } from "./events";

export const invoiceType = pgEnum("en_escena_choreography_invoice_type", [
  "sena",
  "saldo",
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
    paymentMethod: paymentMethod("payment_method").notNull(),
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

export const academyEventChoreographyInvoices = createTable(
  "academy_event_choreography_invoice",
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
    choreographyId: varchar("choreography_id", { length: 255 })
      .notNull()
      .references(() => choreographies.id),
    invoiceNumber: integer("invoice_number").notNull(),
    invoiceType: invoiceType("invoice_type").notNull(),
    issueDate: text("issue_date").notNull(),
    basePriceAmount: integer("base_price_amount").notNull(),
    selectedPriceId: varchar("selected_price_id", { length: 255 }).references(
      () => prices.id,
    ),
    selectedPaymentDeadline: text("selected_payment_deadline"),
    requiredDepositPercentageSnapshot: integer(
      "required_deposit_percentage_snapshot",
    ).notNull(),
    depositAmount: integer("deposit_amount").notNull(),
    depositCompletedOn: text("deposit_completed_on"),
    appliedDepositAmount: integer("applied_deposit_amount"),
    dancerDiscountAmount: integer("dancer_discount_amount"),
    administrativeDiscountAmount: integer("administrative_discount_amount"),
    administrativeDiscountInternalReason: text(
      "administrative_discount_internal_reason",
    ),
    administrativeDiscountPublicLabel: text(
      "administrative_discount_public_label",
    ),
    totalDiscountAmount: integer("total_discount_amount"),
    finalTotalAmount: integer("final_total_amount"),
    cancelledAt: timestamp("cancelled_at", {
      mode: "date",
      withTimezone: true,
    }),
    cancelledReason: text("cancelled_reason"),
    createdByUserId: varchar("created_by_user_id", { length: 255 })
      .notNull()
      .references(() => user.id),
    cancelledByUserId: varchar("cancelled_by_user_id", {
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
    uniqueIndex("academy_event_choreography_invoice_event_number_unique").on(
      table.eventId,
      table.invoiceNumber,
    ),
    uniqueIndex("academy_event_choreography_invoice_active_unique")
      .on(table.choreographyId, table.invoiceType)
      .where(sql`${table.cancelledAt} is null`),
    index("academy_event_choreography_invoice_event_academy_idx").on(
      table.eventId,
      table.academyId,
      table.createdAt,
    ),
    index("academy_event_choreography_invoice_choreography_idx").on(
      table.choreographyId,
      table.createdAt,
    ),
    index("academy_event_choreography_invoice_selected_price_idx").on(
      table.selectedPriceId,
    ),
  ],
).enableRLS();

export const academyEventInvoiceImputations = createTable(
  "academy_event_invoice_imputation",
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
    paymentId: varchar("payment_id", { length: 255 })
      .notNull()
      .references(() => academyEventPayments.id),
    invoiceId: varchar("invoice_id", { length: 255 })
      .notNull()
      .references(() => academyEventChoreographyInvoices.id),
    amount: integer("amount").notNull(),
    imputationDate: text("imputation_date").notNull(),
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
    index("academy_event_invoice_imputation_event_academy_idx").on(
      table.eventId,
      table.academyId,
      table.createdAt,
    ),
    index("academy_event_invoice_imputation_payment_idx").on(
      table.paymentId,
      table.createdAt,
    ),
    index("academy_event_invoice_imputation_invoice_idx").on(
      table.invoiceId,
      table.createdAt,
    ),
  ],
).enableRLS();
