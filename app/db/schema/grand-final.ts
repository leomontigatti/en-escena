import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { user } from "./access";
import { createTable, uuidPrimaryKey } from "./core";
import { events, modalities } from "./events";

/**
 * One judge's `finalistPick`: the academy they choose for the `Gran final` in
 * one modality of the event. One row per judge per modality, upserted, so a
 * judge who changes their mind replaces their pick rather than adding one.
 * Whether the academy is eligible is the save's to check, since eligibility is
 * derived on read and never stored. See CONTEXT.md `finalistPick`.
 *
 * Cascade on all four: a pick means nothing without its event, its modality,
 * its judge or its academy. A merged academy's picks go with it, and its
 * judges pick again among the eligible ones.
 */
export const finalistPicks = createTable(
  "finalist_pick",
  {
    id: uuidPrimaryKey(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    modalityId: varchar("modality_id", { length: 255 }).notNull(),
    judgeId: varchar("judge_id", { length: 255 }).notNull(),
    academyId: varchar("academy_id", { length: 255 }).notNull(),
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
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "finalist_pick_event_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.modalityId],
      foreignColumns: [modalities.id],
      name: "finalist_pick_modality_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.judgeId],
      foreignColumns: [user.id],
      name: "finalist_pick_judge_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.academyId],
      foreignColumns: [academies.id],
      name: "finalist_pick_academy_fk",
    }).onDelete("cascade"),
    uniqueIndex("finalist_pick_event_judge_modality_unique").on(
      table.eventId,
      table.judgeId,
      table.modalityId,
    ),
    index("finalist_pick_academy_idx").on(table.academyId),
  ],
).enableRLS();

/**
 * The two banner pictures a `finalist` shows on the `Gran final` vote page,
 * as storage keys on the uploads volume, never URLs. They belong to the
 * academy within the event, not to a pick: changing or dropping a pick leaves
 * them where they are, and an academy picked again finds them already there.
 * Either key is null until its picture is uploaded.
 *
 * Cascade on both, as for the picks: a merged or deleted academy takes its
 * banners with it, and the objects stay orphaned on the volume as a deleted
 * event's documents do.
 */
export const finalistBanners = createTable(
  "finalist_banner",
  {
    id: uuidPrimaryKey(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    academyId: varchar("academy_id", { length: 255 }).notNull(),
    firstStorageKey: text("first_storage_key"),
    secondStorageKey: text("second_storage_key"),
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
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "finalist_banner_event_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.academyId],
      foreignColumns: [academies.id],
      name: "finalist_banner_academy_fk",
    }).onDelete("cascade"),
    uniqueIndex("finalist_banner_event_academy_unique").on(
      table.eventId,
      table.academyId,
    ),
    index("finalist_banner_academy_idx").on(table.academyId),
  ],
).enableRLS();
