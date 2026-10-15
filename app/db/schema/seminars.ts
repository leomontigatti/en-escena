import { sql } from "drizzle-orm";
import {
  boolean,
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

import { createTable, uuidPrimaryKey } from "./core";
import { events } from "./events";
import { individuals } from "./individuals";
import { dancers, professors } from "./roster";

// The seminars an event offers around the competition: their kind, the event's
// shared price list and the people registered into them. See
// docs/domain/seminars.md.

// The kind of a seminar and of a seminar price. An enum rather than a boolean
// so a third kind is a value and not a migration. See GLOSSARY.md `seminarKind`.
export const seminarKind = pgEnum("en_escena_seminar_kind", [
  "regular",
  "special",
]);

// One priced row of the event's seminar list, shared by every seminar of the
// event: there is deliberately no `seminarId` here. A row prices the
// `(kind, forParticipants)` cell it names, from the dated ladder the
// `paymentDeadline` builds — the deadline-less row is the tail that applies
// once every dated one has expired. See docs/domain/seminars.md, "Prices".
export const seminarPrices = createTable(
  "seminar_price",
  {
    id: uuidPrimaryKey(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    name: text("name").notNull(),
    kind: seminarKind("kind").notNull(),
    forParticipants: boolean("for_participants").notNull(),
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
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "seminar_price_event_fk",
    }).onDelete("cascade"),
    index("seminar_price_event_id_idx").on(table.eventId),
    // `NULLS NOT DISTINCT`, so the one deadline-less row of a cell collides
    // with itself the way `price_general_unique` does (migration 0015). Unlike
    // that one this index is not partial, so Drizzle can express it as a
    // `unique()` constraint and no hand-written SQL is needed.
    unique("seminar_price_cell_unique")
      .on(
        table.eventId,
        table.kind,
        table.forParticipants,
        table.paymentDeadline,
      )
      .nullsNotDistinct(),
    check("seminar_price_amount_positive", sql`${table.amount} >= 1`),
  ],
).enableRLS();

// A class the event offers around the competition: a guest instructor, a local
// date and time, and a quota of places. Registration is unlimited; the quota
// bounds how many inscriptions may cover their deposit, because covering it is
// what takes a place. The seminar carries no name of its own — the instructor
// plus the moment is what identifies it, which is what the unique index below
// states.
export const seminars = createTable(
  "seminar",
  {
    id: uuidPrimaryKey(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    instructorName: text("instructor_name").notNull(),
    instructorPictureStorageKey: text("instructor_picture_storage_key"),
    scheduledDate: text("scheduled_date").notNull(),
    startTime: text("start_time").notNull(),
    quota: integer("quota").notNull(),
    kind: seminarKind("kind").notNull().default("regular"),
    // The seminar's own deposit rate, never the event's: the rate is what fixes
    // the place, a per-seminar fact, while the price list is shared across the
    // event's seminars. See docs/domain/seminars.md, "The seminar".
    requiredDepositPercentage: integer("required_deposit_percentage")
      .notNull()
      .default(50),
    createdAt: timestamp("created_at", {
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
      name: "seminar_event_fk",
    }).onDelete("cascade"),
    index("seminar_event_id_idx").on(table.eventId),
    uniqueIndex("seminar_event_instructor_slot_unique").on(
      table.eventId,
      table.instructorName,
      table.scheduledDate,
      table.startTime,
    ),
    check("seminar_quota_positive", sql`${table.quota} >= 1`),
    check(
      "seminar_required_deposit_percentage_range",
      sql`${table.requiredDepositPercentage} between 1 and 99`,
    ),
  ],
).enableRLS();

// One person registered into one seminar: a roster person (a dancer or a
// professor) or an `individual` registering itself (ADR-0019). The owning
// academy is not a column: it is read through the person —the individual's
// through its owner row of kind `individual`— so the roster and the
// inscription can never disagree about who an inscription belongs to.
export const seminarInscriptions = createTable(
  "seminar_inscription",
  {
    id: uuidPrimaryKey(),
    seminarId: varchar("seminar_id", { length: 255 }).notNull(),
    dancerId: varchar("dancer_id", { length: 255 }),
    professorId: varchar("professor_id", { length: 255 }),
    individualId: varchar("individual_id", { length: 255 }),
    // The `seminarPrice` row the inscription is charged by, written only when
    // an administrator allocates money to it, exactly as a choreography
    // inscription's `selectedPriceId` is. The price guards read it to know
    // which rows an inscription depends on.
    selectedPriceId: varchar("selected_price_id", { length: 255 }),
    // When the inscription was withdrawn, which is what tells a row that keeps
    // its money apart from one that never had any. A withdrawn row holds no
    // place and appears on no roster; the removal chooser stamps it and
    // nothing clears it: registering the person again inserts a new row.
    withdrawnAt: timestamp("withdrawn_at", {
      mode: "date",
      withTimezone: true,
    }),
    // Until when the inscription holds a reserved place without having covered
    // its deposit (`seminarReservation`). Written once, at the insert, and only
    // when the seminar had a place free. Null is no reservation.
    reservedUntil: timestamp("reserved_until", {
      mode: "date",
      withTimezone: true,
    }),
    // When the person was registered. A registration after a withdrawal is a
    // new row with its own date.
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    foreignKey({
      columns: [table.seminarId],
      foreignColumns: [seminars.id],
      name: "seminar_inscription_seminar_fk",
    }).onDelete("cascade"),
    // The person keys restrict on purpose: nobody deletes roster people today,
    // and if a path ever appears the database refuses while inscriptions exist.
    foreignKey({
      columns: [table.dancerId],
      foreignColumns: [dancers.id],
      name: "seminar_inscription_dancer_fk",
    }),
    foreignKey({
      columns: [table.professorId],
      foreignColumns: [professors.id],
      name: "seminar_inscription_professor_fk",
    }),
    foreignKey({
      columns: [table.individualId],
      foreignColumns: [individuals.id],
      name: "seminar_inscription_individual_fk",
    }),
    foreignKey({
      columns: [table.selectedPriceId],
      foreignColumns: [seminarPrices.id],
      name: "seminar_inscription_selected_price_fk",
    }),
    index("seminar_inscription_seminar_id_idx").on(table.seminarId),
    index("seminar_inscription_dancer_id_idx").on(table.dancerId),
    index("seminar_inscription_professor_id_idx").on(table.professorId),
    index("seminar_inscription_individual_id_idx").on(table.individualId),
    uniqueIndex("seminar_inscription_seminar_dancer_unique")
      .on(table.seminarId, table.dancerId)
      .where(
        sql`${table.dancerId} is not null and ${table.withdrawnAt} is null`,
      ),
    uniqueIndex("seminar_inscription_seminar_professor_unique")
      .on(table.seminarId, table.professorId)
      .where(
        sql`${table.professorId} is not null and ${table.withdrawnAt} is null`,
      ),
    uniqueIndex("seminar_inscription_seminar_individual_unique")
      .on(table.seminarId, table.individualId)
      .where(
        sql`${table.individualId} is not null and ${table.withdrawnAt} is null`,
      ),
    check(
      "seminar_inscription_exactly_one_person",
      sql`num_nonnulls(${table.dancerId}, ${table.professorId}, ${table.individualId}) = 1`,
    ),
  ],
).enableRLS();
