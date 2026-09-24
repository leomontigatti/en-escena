import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { createTable, uuidPrimaryKey } from "./core";
import { events, submodalities } from "./events";
import { judgeAssignments } from "./presentations";

export const criterionKind = pgEnum("en_escena_criterion_kind", [
  "adds",
  "deducts",
]);

/**
 * One line of a submodality's scoring sheet. A submodality with no criteria —
 * and a modality with no submodalities — is scored with a single 0-100 value
 * instead, so the empty list is a meaningful state rather than a missing setup.
 * See docs/domain/judging.md, "Scores And Feedback".
 *
 * The adding maxima total exactly 100 and deductions sit outside that total;
 * that rule spans the whole sheet, so it belongs to validation and to the save,
 * not here. What the table can state on its own is that a maximum is a whole
 * number from 1.
 *
 * Cascade on the submodality: the criteria describe how it is judged and mean
 * nothing without it. Deleting a submodality that has been scored is already
 * refused elsewhere, so the cascade never takes criteria a score points at.
 */
export const submodalityCriteria = createTable(
  "submodality_criterion",
  {
    id: uuidPrimaryKey(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    submodalityId: varchar("submodality_id", { length: 255 }).notNull(),
    name: text("name").notNull(),
    maximum: integer("maximum").notNull(),
    kind: criterionKind("kind").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "submodality_criterion_event_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.submodalityId],
      foreignColumns: [submodalities.id],
      name: "submodality_criterion_submodality_fk",
    }).onDelete("cascade"),
    index("submodality_criterion_submodality_idx").on(table.submodalityId),
    uniqueIndex("submodality_criterion_submodality_name_unique").on(
      table.submodalityId,
      sql`lower(${table.name})`,
    ),
    check("submodality_criterion_maximum_whole", sql`${table.maximum} >= 1`),
  ],
).enableRLS();

/**
 * What one judge gave one presentation. The row is created on the judge's first
 * save, never on assignment, so its existence is what "this presentation was
 * evaluated" means — see app/lib/presentations/evaluation-lock.server.ts.
 *
 * `value` is nullable for the one case that has no number: a judge who saved
 * only a `Devolución` on a presentation the panel had disqualified. For a sheet
 * it holds the computed total, recomputed on every save, so an average never
 * has to re-derive a sheet.
 *
 * Restrict on the assignment: a judge with a score cannot be taken off the
 * presentation, and the removal seam refuses it with a message rather than
 * letting the database raise.
 */
export const scores = createTable(
  "score",
  {
    id: uuidPrimaryKey(),
    judgeAssignmentId: varchar("judge_assignment_id", {
      length: 255,
    }).notNull(),
    value: numeric("value", { mode: "string", precision: 4, scale: 1 }),
    feedbackAudioStorageKey: text("feedback_audio_storage_key"),
    annulled: boolean("annulled").notNull().default(false),
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
      columns: [table.judgeAssignmentId],
      foreignColumns: [judgeAssignments.id],
      name: "score_judge_assignment_fk",
    }).onDelete("restrict"),
    uniqueIndex("score_judge_assignment_unique").on(table.judgeAssignmentId),
    check(
      "score_value_range",
      sql`${table.value} is null or (${table.value} >= 0 and ${table.value} <= 100)`,
    ),
    check(
      "score_value_half_step",
      sql`${table.value} is null or mod(${table.value} * 10, 5) = 0`,
    ),
  ],
).enableRLS();

/**
 * One filled line of a sheet. Keyed by the pair, so a judge has at most one
 * value per criterion and the sheet is saved as a whole.
 *
 * Cascade on the score and restrict on the criterion: the values are part of
 * the score, while a criterion that has been scored is locked and cannot be
 * deleted out from under them.
 *
 * The "no more than the criterion's maximum" bound is the one rule that reads
 * another row, which a check constraint cannot do; it is a trigger, beside the
 * checks the row can state on its own. See the migration.
 */
export const scoreCriterionValues = createTable(
  "score_criterion_value",
  {
    scoreId: varchar("score_id", { length: 255 }).notNull(),
    criterionId: varchar("criterion_id", { length: 255 }).notNull(),
    value: numeric("value", {
      mode: "string",
      precision: 4,
      scale: 1,
    }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.scoreId, table.criterionId],
      name: "score_criterion_value_pk",
    }),
    foreignKey({
      columns: [table.scoreId],
      foreignColumns: [scores.id],
      name: "score_criterion_value_score_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.criterionId],
      foreignColumns: [submodalityCriteria.id],
      name: "score_criterion_value_criterion_fk",
    }).onDelete("restrict"),
    index("score_criterion_value_criterion_idx").on(table.criterionId),
    check("score_criterion_value_non_negative", sql`${table.value} >= 0`),
    check(
      "score_criterion_value_half_step",
      sql`mod(${table.value} * 10, 5) = 0`,
    ),
  ],
).enableRLS();
