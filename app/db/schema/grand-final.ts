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

/**
 * One print run of `voteCode`s administration generates for the event. Its
 * `number` is what the printout and the list call it (`Lote 3`), counted per
 * event. `createdAt` is when it was issued. `voidedAt` voids every code in
 * it at once: a lost or leaked run is voided as a whole, never code by code.
 *
 * Cascade on the event: a deleted event's batches mean nothing.
 */
export const voteCodeBatches = createTable(
  "vote_code_batch",
  {
    id: uuidPrimaryKey(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    number: integer("number").notNull(),
    voidedAt: timestamp("voided_at", { mode: "date", withTimezone: true }),
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
      name: "vote_code_batch_event_fk",
    }).onDelete("cascade"),
    uniqueIndex("vote_code_batch_event_number_unique").on(
      table.eventId,
      table.number,
    ),
  ],
).enableRLS();

/**
 * A one-time `voteCode`: a random token the printed QR carries in the vote
 * URL. Nothing about it depends on a date, so it is valid on any day of the
 * event; whether it is voided is its batch's. The token is unique across every
 * event, not only its own, so a code can never be read as another's.
 *
 * Cascade on the batch, which cascades on the event.
 */
export const voteCodes = createTable(
  "vote_code",
  {
    id: uuidPrimaryKey(),
    batchId: varchar("batch_id", { length: 255 }).notNull(),
    token: varchar("token", { length: 64 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.batchId],
      foreignColumns: [voteCodeBatches.id],
      name: "vote_code_batch_fk",
    }).onDelete("cascade"),
    uniqueIndex("vote_code_token_unique").on(table.token),
    index("vote_code_batch_idx").on(table.batchId),
  ],
).enableRLS();

/**
 * One run of the public vote of the `Gran final` (`votingRound`). `number` is
 * 1, or 2 for the `Desempate`; an event holds at most one of each. Open from
 * `openedAt` while `closedAt` is null. See CONTEXT.md `votingRound`.
 *
 * Cascade on the event, as everything of the `Gran final` does.
 */
export const votingRounds = createTable(
  "voting_round",
  {
    id: uuidPrimaryKey(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    number: integer("number").notNull(),
    openedAt: timestamp("opened_at", { mode: "date", withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    closedAt: timestamp("closed_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "voting_round_event_fk",
    }).onDelete("cascade"),
    uniqueIndex("voting_round_event_number_unique").on(
      table.eventId,
      table.number,
    ),
    check("voting_round_number_check", sql`${table.number} in (1, 2)`),
  ],
).enableRLS();

/**
 * A `finalist` as the round copied it when it opened, with the two banner
 * keys it had then: later picks and banner changes leave a round in progress
 * alone. The objects these keys name are kept while a round names them.
 *
 * Cascade on the round and on the academy, but a vote for the academy
 * holds its row in place: neither goes while the round has votes for it.
 */
export const votingRoundFinalists = createTable(
  "voting_round_finalist",
  {
    id: uuidPrimaryKey(),
    roundId: varchar("round_id", { length: 255 }).notNull(),
    academyId: varchar("academy_id", { length: 255 }).notNull(),
    firstStorageKey: text("first_storage_key").notNull(),
    secondStorageKey: text("second_storage_key").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.roundId],
      foreignColumns: [votingRounds.id],
      name: "voting_round_finalist_round_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.academyId],
      foreignColumns: [academies.id],
      name: "voting_round_finalist_academy_fk",
    }).onDelete("cascade"),
    // A constraint, not an index: the votes' composite key references it, and
    // a constraint is created with its table, ahead of any key that needs it.
    unique("voting_round_finalist_round_academy_unique").on(
      table.roundId,
      table.academyId,
    ),
    index("voting_round_finalist_academy_idx").on(table.academyId),
  ],
).enableRLS();

/** Where a `voter` signed in. Meta is a second value when its review clears. */
export const voterProvider = pgEnum("en_escena_voter_provider", ["google"]);

/**
 * A `voter` (ADR-0018): a person the provider vouched for, kept only to cast
 * one vote per round. It is not a `user` and reaches nothing of the access
 * domain. The provider's subject is the identity; the email is kept as a keyed
 * hash, or not at all when the provider shares none, and links nothing.
 *
 * Never deleted while it holds a vote: the vote's key restricts.
 */
export const voters = createTable(
  "voter",
  {
    id: uuidPrimaryKey(),
    provider: voterProvider("provider").notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    emailHash: varchar("email_hash", { length: 64 }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("voter_provider_subject_unique").on(
      table.provider,
      table.subject,
    ),
  ],
).enableRLS();

/** How a `vote` was cast: with a printed `voteCode`, or by a signed-in `voter`. */
export const voteKind = pgEnum("en_escena_vote_kind", ["code", "social"]);

/**
 * One `vote`: a choice of one finalist of one round, cast once and never
 * changed or deleted. Its keys restrict, so a round, an event, an academy or a
 * code with votes cannot be deleted either, and a trigger refuses any update
 * or delete that reaches the row anyway.
 * Its weight is fixed by its kind, ten for a code and one for a voter.
 *
 * A code, and a voter, votes once per round: the unique indexes are what
 * refuse the second vote, under any concurrency, and a cast reads its conflict
 * as "already voted". A vote names exactly one of the two, by its kind. The academy must be one the round copied, through the composite key.
 */
export const votes = createTable(
  "vote",
  {
    id: uuidPrimaryKey(),
    roundId: varchar("round_id", { length: 255 }).notNull(),
    academyId: varchar("academy_id", { length: 255 }).notNull(),
    kind: voteKind("kind").notNull(),
    points: integer("points").notNull(),
    voteCodeId: varchar("vote_code_id", { length: 255 }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Last, as the column was added after the table: an insert from a select
    // names the columns in this order.
    voterId: varchar("voter_id", { length: 255 }),
  },
  (table) => [
    foreignKey({
      columns: [table.roundId],
      foreignColumns: [votingRounds.id],
      name: "vote_round_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.roundId, table.academyId],
      foreignColumns: [
        votingRoundFinalists.roundId,
        votingRoundFinalists.academyId,
      ],
      name: "vote_round_finalist_fk",
    }),
    foreignKey({
      columns: [table.voteCodeId],
      foreignColumns: [voteCodes.id],
      name: "vote_code_fk",
    }),
    foreignKey({
      columns: [table.voterId],
      foreignColumns: [voters.id],
      name: "vote_voter_fk",
    }).onDelete("restrict"),
    uniqueIndex("vote_round_code_unique").on(table.roundId, table.voteCodeId),
    uniqueIndex("vote_round_voter_unique").on(table.roundId, table.voterId),
    index("vote_round_academy_idx").on(table.roundId, table.academyId),
    index("vote_code_idx").on(table.voteCodeId),
    index("vote_voter_idx").on(table.voterId),
    check(
      "vote_kind_points_check",
      sql`(${table.kind} = 'code' and ${table.points} = 10 and ${table.voteCodeId} is not null) or (${table.kind} = 'social' and ${table.points} = 1 and ${table.voteCodeId} is null)`,
    ),
    check(
      "vote_kind_voter_check",
      sql`(${table.kind} = 'code' and ${table.voterId} is null) or (${table.kind} = 'social' and ${table.voterId} is not null)`,
    ),
  ],
).enableRLS();
