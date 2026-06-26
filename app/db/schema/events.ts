import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { createTable, groupType } from "./core";

export const events = createTable(
  "event",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(false),
    programVisible: boolean("program_visible").notNull().default(false),
    resultsVisible: boolean("results_visible").notNull().default(false),
    requiredDepositPercentage: integer("required_deposit_percentage")
      .notNull()
      .default(30),
    registrationStartsAt: timestamp("registration_starts_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    registrationEndsAt: timestamp("registration_ends_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    startsAt: timestamp("starts_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    endsAt: timestamp("ends_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    registrationReady: boolean("registration_ready").notNull().default(false),
    registrationReadinessMissingItems: jsonb(
      "registration_readiness_missing_items",
    )
      .$type<
        Array<{
          code: string;
          label: string;
          detail: string;
        }>
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    registrationReadinessDirty: boolean("registration_readiness_dirty")
      .notNull()
      .default(true),
    registrationReadinessCalculatedAt: timestamp(
      "registration_readiness_calculated_at",
      {
        mode: "date",
        withTimezone: true,
      },
    ),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("event_single_active_unique")
      .on(table.active)
      .where(sql`${table.active} = true`),
  ],
).enableRLS();

export const modalities = createTable(
  "modality",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: varchar("event_id", { length: 255 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("modality_event_id_idx").on(table.eventId),
    uniqueIndex("modality_event_name_unique").on(table.eventId, table.name),
  ],
).enableRLS();

export const submodalities = createTable(
  "submodality",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: varchar("event_id", { length: 255 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    modalityId: varchar("modality_id", { length: 255 })
      .notNull()
      .references(() => modalities.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("submodality_event_id_idx").on(table.eventId),
    index("submodality_modality_id_idx").on(table.modalityId),
    uniqueIndex("submodality_modality_name_unique").on(
      table.modalityId,
      sql`lower(${table.name})`,
    ),
  ],
).enableRLS();

export const experienceLevels = createTable(
  "experience_level",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: varchar("event_id", { length: 255 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("experience_level_event_id_idx").on(table.eventId),
    uniqueIndex("experience_level_event_name_unique").on(
      table.eventId,
      table.name,
    ),
  ],
).enableRLS();

export const categories = createTable(
  "category",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: varchar("event_id", { length: 255 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    minAge: integer("min_age").notNull(),
    maxAge: integer("max_age").notNull(),
    groupTypes: groupType("group_types").array().notNull(),
    groupTypeKey: text("group_type_key").notNull(),
    experienceLevelKey: text("experience_level_key").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("category_event_id_idx").on(table.eventId),
    index("category_event_age_range_idx").on(
      table.eventId,
      table.minAge,
      table.maxAge,
    ),
  ],
).enableRLS();

export const categoryModalities = createTable(
  "category_modality",
  {
    categoryId: varchar("category_id", { length: 255 }).notNull(),
    modalityId: varchar("modality_id", { length: 255 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: "category_modality_category_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.modalityId],
      foreignColumns: [modalities.id],
      name: "category_modality_modality_fk",
    }),
    uniqueIndex("category_modality_unique").on(
      table.categoryId,
      table.modalityId,
    ),
    index("category_modality_modality_id_idx").on(table.modalityId),
  ],
).enableRLS();

export const categoryExperienceLevels = createTable(
  "category_experience_level",
  {
    categoryId: varchar("category_id", { length: 255 }).notNull(),
    experienceLevelId: varchar("experience_level_id", {
      length: 255,
    }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: "category_level_category_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.experienceLevelId],
      foreignColumns: [experienceLevels.id],
      name: "category_level_level_fk",
    }),
    uniqueIndex("category_experience_level_unique").on(
      table.categoryId,
      table.experienceLevelId,
    ),
    index("category_experience_level_level_id_idx").on(table.experienceLevelId),
  ],
).enableRLS();

export const schedules = createTable(
  "schedule",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: varchar("event_id", { length: 255 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    scheduledDate: text("scheduled_date").notNull(),
    startTime: text("start_time").notNull(),
    totalCapacity: integer("total_capacity").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("schedule_event_id_idx").on(table.eventId)],
).enableRLS();

export const scheduleModalities = createTable(
  "schedule_modality",
  {
    scheduleId: varchar("schedule_id", { length: 255 }).notNull(),
    modalityId: varchar("modality_id", { length: 255 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.scheduleId],
      foreignColumns: [schedules.id],
      name: "schedule_modality_schedule_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.modalityId],
      foreignColumns: [modalities.id],
      name: "schedule_modality_modality_fk",
    }),
    index("schedule_modality_schedule_id_idx").on(table.scheduleId),
    index("schedule_modality_modality_id_idx").on(table.modalityId),
    uniqueIndex("schedule_modality_unique").on(
      table.scheduleId,
      table.modalityId,
    ),
  ],
).enableRLS();

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
    scheduleId: varchar("schedule_id", { length: 255 }),
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
    foreignKey({
      columns: [table.scheduleId],
      foreignColumns: [schedules.id],
      name: "price_schedule_fk",
    }),
    index("price_schedule_id_idx").on(table.scheduleId),
    uniqueIndex("price_general_unique")
      .on(table.eventId, table.groupType, table.paymentDeadline)
      .where(sql`${table.scheduleId} is null`),
    uniqueIndex("price_specific_unique")
      .on(
        table.eventId,
        table.groupType,
        table.scheduleId,
        table.paymentDeadline,
      )
      .where(sql`${table.scheduleId} is not null`),
  ],
).enableRLS();

export const scheduleCapacities = createTable(
  "schedule_capacity",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    scheduleId: varchar("schedule_id", { length: 255 }).notNull(),
    groupType: groupType("group_type").notNull(),
    capacity: integer("capacity").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    foreignKey({
      columns: [table.scheduleId],
      foreignColumns: [schedules.id],
      name: "schedule_capacity_schedule_fk",
    }).onDelete("cascade"),
    index("schedule_capacity_schedule_id_idx").on(table.scheduleId),
    uniqueIndex("schedule_capacity_schedule_group_type_unique").on(
      table.scheduleId,
      table.groupType,
    ),
  ],
).enableRLS();
