import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import {
  createTable,
  experienceLevel,
  groupType,
  uuidPrimaryKey,
} from "./core";
import { dancers, professors } from "./roster";

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
    // What an academy needs in order to pay this event: the bank identifiers
    // of the account that receives the money and free text on how to pay.
    // Nullable and empty on a new event; an empty field is NULL, never "".
    // There is no history and no timestamp of its own — a change is a silent
    // overwrite. See docs/domain/finances.md#payment-instructions.
    paymentInstructionsCbu: text("payment_instructions_cbu"),
    paymentInstructionsAlias: text("payment_instructions_alias"),
    paymentInstructionsHolderName: text("payment_instructions_holder_name"),
    paymentInstructionsBankName: text("payment_instructions_bank_name"),
    paymentInstructionsHolderCuit: text("payment_instructions_holder_cuit"),
    paymentInstructionsText: text("payment_instructions_text"),
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
    experienceLevels: experienceLevel("experience_levels")
      .array()
      .notNull()
      .default(sql`ARRAY[]::en_escena_experience_level[]`),
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

// The kind of a seminar and of a seminar price. An enum rather than a boolean
// so a third kind is a value and not a migration. See CONTEXT.md `seminarKind`.
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
// date and time, and a hard cap on how many roster people an academy can
// register. It carries no name of its own — the instructor plus the moment is
// what identifies it, which is what the unique index below states.
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

// One roster person registered into one seminar. The owning academy is not a
// column: it is read through the person, so the roster and the inscription can
// never disagree about who an inscription belongs to.
export const seminarInscriptions = createTable(
  "seminar_inscription",
  {
    id: uuidPrimaryKey(),
    seminarId: varchar("seminar_id", { length: 255 }).notNull(),
    dancerId: varchar("dancer_id", { length: 255 }),
    professorId: varchar("professor_id", { length: 255 }),
    // The `seminarPrice` row the inscription is charged by, written only when
    // an administrator allocates money to it, exactly as a choreography
    // inscription's `selectedPriceId` is. Nothing writes it yet; the price
    // guards read it to know which rows an inscription depends on.
    selectedPriceId: varchar("selected_price_id", { length: 255 }),
    // The order the quota was consumed in, which is the only history the row
    // keeps: an inscription is created and deleted, never edited.
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
      columns: [table.selectedPriceId],
      foreignColumns: [seminarPrices.id],
      name: "seminar_inscription_selected_price_fk",
    }),
    index("seminar_inscription_seminar_id_idx").on(table.seminarId),
    index("seminar_inscription_dancer_id_idx").on(table.dancerId),
    index("seminar_inscription_professor_id_idx").on(table.professorId),
    uniqueIndex("seminar_inscription_seminar_dancer_unique")
      .on(table.seminarId, table.dancerId)
      .where(sql`${table.dancerId} is not null`),
    uniqueIndex("seminar_inscription_seminar_professor_unique")
      .on(table.seminarId, table.professorId)
      .where(sql`${table.professorId} is not null`),
    check(
      "seminar_inscription_exactly_one_person",
      sql`num_nonnulls(${table.dancerId}, ${table.professorId}) = 1`,
    ),
  ],
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
    // Both unique indexes below are created with `NULLS NOT DISTINCT` by
    // migration 0015, so the one deadline-less price per tier collides
    // with itself. Drizzle can only express that on a `unique()` constraint,
    // and neither of these can be one: both are partial.
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

// One counter per event, one row per event. It feeds the readable numbers the
// user reads and searches by: the payment's and the choreography's. Each number
// is handed out by taking this row with `FOR UPDATE` inside the same
// transaction that inserts, so two simultaneous creations serialize instead of
// repeating a number. The numbering leaves gaps — deleting a choreography does
// not give its number back — and that is as it should be: these numbers
// identify, they do not count.
export const eventSequences = createTable(
  "event_sequence",
  {
    eventId: varchar("event_id", { length: 255 })
      .primaryKey()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    nextPaymentNumber: integer("next_payment_number").notNull().default(1),
    nextChoreographyNumber: integer("next_choreography_number")
      .notNull()
      .default(1),
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
  (table) => [index("event_sequence_updated_idx").on(table.updatedAt)],
).enableRLS();

// Deliberately unlike its neighbours, and not an oversight: the enum carries no
// `en_escena_` prefix and the table declares no `.enableRLS()`. The prefix is a
// `create-t3-app` leftover, and the RLS call only ever muted a Supabase warning
// against an app that connects as the table owner. #506 removes both repo-wide,
// so a new declaration should not add to the pile.
export const eventDocumentKind = pgEnum("event_document_kind", [
  "professor_contract",
  "minor_authorization",
  "adult_contract",
]);

// A row exists only when a document is uploaded; absence is "no document". A
// new event therefore starts empty, with no carry-over from the previous one.
export const eventDocuments = createTable(
  "event_document",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    kind: eventDocumentKind("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedAt: timestamp("uploaded_at", {
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
    }).onDelete("cascade"),
    uniqueIndex("event_document_event_kind_unique").on(
      table.eventId,
      table.kind,
    ),
  ],
);
