import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import {
  choreographyCategoryCalculationMode,
  createTable,
  experienceLevel,
  groupType,
} from "./core";
import {
  categories,
  events,
  modalities,
  scheduleCapacities,
  schedules,
  submodalities,
} from "./events";
import { dancers, professors } from "./roster";

export const choreographies = createTable(
  "choreography",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: varchar("event_id", { length: 255 })
      .notNull()
      .references(() => events.id),
    academyId: varchar("academy_id", { length: 255 })
      .notNull()
      .references(() => academies.id),
    name: text("name").notNull(),
    modalityId: varchar("modality_id", { length: 255 })
      .notNull()
      .references(() => modalities.id),
    submodalityId: varchar("submodality_id", { length: 255 }),
    groupType: groupType("group_type").notNull(),
    categoryId: varchar("category_id", { length: 255 }).references(
      () => categories.id,
    ),
    categoryAgeBasis: integer("category_age_basis"),
    categoryCalculationMode: choreographyCategoryCalculationMode(
      "category_calculation_mode",
    ).notNull(),
    experienceLevelId: experienceLevel("experience_level"),
    scheduleId: varchar("schedule_id", { length: 255 }),
    scheduleCapacityId: varchar("schedule_capacity_id", {
      length: 255,
    }),
    musicStorageKey: text("music_storage_key"),
    hasPresentation: boolean("has_presentation").notNull().default(false),
    hasActiveFinancialLink: boolean("has_active_financial_link")
      .notNull()
      .default(false),
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
    index("choreography_event_academy_created_idx").on(
      table.eventId,
      table.academyId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.submodalityId],
      foreignColumns: [submodalities.id],
      name: "choreography_submodality_fk",
    }),
    foreignKey({
      columns: [table.scheduleId],
      foreignColumns: [schedules.id],
      name: "choreography_schedule_fk",
    }),
    foreignKey({
      columns: [table.scheduleCapacityId],
      foreignColumns: [scheduleCapacities.id],
      name: "choreography_schedule_capacity_fk",
    }),
    index("choreography_schedule_id_idx").on(table.scheduleId),
    index("choreography_schedule_capacity_id_idx").on(table.scheduleCapacityId),
  ],
).enableRLS();

export const choreographyDancers = createTable(
  "choreography_dancer",
  {
    choreographyId: varchar("choreography_id", { length: 255 }).notNull(),
    dancerId: varchar("dancer_id", { length: 255 }).notNull(),
    ageAtEventStart: integer("age_at_event_start").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.choreographyId],
      foreignColumns: [choreographies.id],
      name: "choreography_dancer_choreography_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.dancerId],
      foreignColumns: [dancers.id],
      name: "choreography_dancer_dancer_fk",
    }),
    uniqueIndex("choreography_dancer_unique").on(
      table.choreographyId,
      table.dancerId,
    ),
    index("choreography_dancer_dancer_id_idx").on(table.dancerId),
  ],
).enableRLS();

export const choreographyProfessors = createTable(
  "choreography_professor",
  {
    choreographyId: varchar("choreography_id", { length: 255 }).notNull(),
    professorId: varchar("professor_id", { length: 255 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.choreographyId],
      foreignColumns: [choreographies.id],
      name: "choreography_professor_choreography_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.professorId],
      foreignColumns: [professors.id],
      name: "choreography_professor_professor_fk",
    }),
    uniqueIndex("choreography_professor_unique").on(
      table.choreographyId,
      table.professorId,
    ),
    index("choreography_professor_professor_id_idx").on(table.professorId),
  ],
).enableRLS();
