import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTableCreator,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const createTable = pgTableCreator((name) => `en_escena_${name}`);

export const userRole = pgEnum("en_escena_user_role", [
  "academy",
  "admin",
  "auditor",
  "judge",
]);

export const groupType = pgEnum("en_escena_group_type", [
  "solo",
  "duo",
  "trio",
  "grupal",
]);

export const documentType = pgEnum("en_escena_document_type", [
  "dni",
  "passport",
  "other",
]);

export const choreographyCategoryCalculationMode = pgEnum(
  "en_escena_choreography_category_calculation_mode",
  ["oldest", "group_tolerance", "group_average"],
);

export const administrativeAuditEntityType = pgEnum(
  "en_escena_administrative_audit_entity_type",
  ["professor", "dancer", "user"],
);

export const administrativeAuditAction = pgEnum(
  "en_escena_administrative_audit_action",
  [
    "create",
    "update",
    "archive",
    "reactivate",
    "reset-password",
    "verify-identity",
  ],
);

export const user = createTable("user", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .notNull()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("academy"),
  internalUsername: text("internal_username").unique(),
  requiresPasswordChange: boolean("requires_password_change")
    .notNull()
    .default(false),
  suspended: boolean("suspended").notNull().default(false),
  sessionInvalidBefore: timestamp("session_invalid_before", {
    mode: "date",
    withTimezone: true,
  }),
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
});

export const accessSession = createTable(
  "access_session",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    token: text("token").notNull().unique(),
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
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("access_session_user_id_idx").on(table.userId)],
);

export const accessCredential = createTable(
  "access_credential",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
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
  (table) => [uniqueIndex("access_credential_user_id_unique").on(table.userId)],
);

export const academies = createTable(
  "academy",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactName: text("contact_name").notNull(),
    phone: text("phone").notNull(),
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
  (table) => [uniqueIndex("academy_user_id_unique").on(table.userId)],
);

export const dancers = createTable(
  "dancer",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    academyId: varchar("academy_id", { length: 255 })
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    birthDate: text("birth_date").notNull(),
    active: boolean("active").notNull().default(true),
    documentType: documentType("document_type"),
    documentNumber: text("document_number"),
    documentFrontImageStorageKey: text("document_front_image_storage_key"),
    documentBackImageStorageKey: text("document_back_image_storage_key"),
    identityVerifiedAt: timestamp("identity_verified_at", {
      mode: "date",
      withTimezone: true,
    }),
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
    index("dancer_academy_id_idx").on(table.academyId),
    index("dancer_academy_name_idx").on(
      table.academyId,
      table.lastName,
      table.firstName,
    ),
    uniqueIndex("dancer_academy_document_unique")
      .on(table.academyId, table.documentType, table.documentNumber)
      .where(
        sql`${table.documentType} is not null and ${table.documentNumber} is not null`,
      ),
  ],
);

export const academyRegistrationTokens = createTable(
  "academy_registration_token",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    consumedAt: timestamp("consumed_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("academy_registration_token_hash_unique").on(table.tokenHash),
    index("academy_registration_token_email_idx").on(table.email),
  ],
);

export const professors = createTable(
  "professor",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    academyId: varchar("academy_id", { length: 255 })
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    active: boolean("active").notNull().default(true),
    documentType: documentType("document_type"),
    documentNumber: text("document_number"),
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
    index("professor_academy_id_idx").on(table.academyId),
    uniqueIndex("professor_academy_document_unique")
      .on(table.academyId, table.documentType, table.documentNumber)
      .where(
        sql`${table.documentType} is not null and ${table.documentNumber} is not null`,
      ),
  ],
);

export const internalUserInvitations = createTable(
  "internal_user_invitation",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull(),
    role: userRole("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    consumedAt: timestamp("consumed_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("internal_user_invitation_token_hash_unique").on(
      table.tokenHash,
    ),
    index("internal_user_invitation_email_idx").on(table.email),
  ],
);

export const internalInvitationTokens = internalUserInvitations;

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
);

export const administrativeAuditEntries = createTable(
  "administrative_audit_entry",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    entityType: administrativeAuditEntityType("entity_type").notNull(),
    entityId: varchar("entity_id", { length: 255 }).notNull(),
    eventId: varchar("event_id", { length: 255 }),
    adminUserId: varchar("admin_user_id", { length: 255 }).notNull(),
    action: administrativeAuditAction("action").notNull(),
    reason: text("reason"),
    beforeValues: jsonb("before_values")
      .$type<Record<string, unknown>>()
      .notNull(),
    afterValues: jsonb("after_values")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("administrative_audit_entry_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "audit_entry_event_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.adminUserId],
      foreignColumns: [user.id],
      name: "audit_entry_admin_user_fk",
    }).onDelete("cascade"),
    index("administrative_audit_entry_event_idx").on(table.eventId),
    index("administrative_audit_entry_admin_user_idx").on(table.adminUserId),
  ],
);

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
);

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
);

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
);

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
);

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
);

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
);

export const scheduleBlocks = createTable(
  "schedule_block",
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
  (table) => [
    index("schedule_block_event_id_idx").on(table.eventId),
    uniqueIndex("schedule_block_event_name_unique").on(
      table.eventId,
      table.name,
    ),
  ],
);

export const scheduleBlockModalities = createTable(
  "schedule_block_modality",
  {
    scheduleBlockId: varchar("schedule_block_id", { length: 255 }).notNull(),
    modalityId: varchar("modality_id", { length: 255 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.scheduleBlockId],
      foreignColumns: [scheduleBlocks.id],
      name: "schedule_block_modality_block_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.modalityId],
      foreignColumns: [modalities.id],
      name: "schedule_block_modality_modality_fk",
    }),
    index("schedule_block_modality_block_id_idx").on(table.scheduleBlockId),
    index("schedule_block_modality_modality_id_idx").on(table.modalityId),
    uniqueIndex("schedule_block_modality_unique").on(
      table.scheduleBlockId,
      table.modalityId,
    ),
  ],
);

export const prices = createTable(
  "price",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: varchar("event_id", { length: 255 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    scheduleBlockId: varchar("schedule_block_id", { length: 255 }),
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
      columns: [table.scheduleBlockId],
      foreignColumns: [scheduleBlocks.id],
      name: "price_schedule_block_fk",
    }),
    index("price_schedule_block_id_idx").on(table.scheduleBlockId),
    uniqueIndex("price_general_unique")
      .on(table.eventId, table.groupType, table.paymentDeadline)
      .where(sql`${table.scheduleBlockId} is null`),
    uniqueIndex("price_specific_unique")
      .on(
        table.eventId,
        table.groupType,
        table.scheduleBlockId,
        table.paymentDeadline,
      )
      .where(sql`${table.scheduleBlockId} is not null`),
  ],
);

export const scheduleEntries = createTable(
  "schedule_entry",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    scheduleBlockId: varchar("schedule_block_id", { length: 255 }).notNull(),
    groupTypes: groupType("group_types").array().notNull(),
    groupTypeKey: text("group_type_key").notNull(),
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
      columns: [table.scheduleBlockId],
      foreignColumns: [scheduleBlocks.id],
      name: "schedule_entry_block_fk",
    }).onDelete("cascade"),
    index("schedule_entry_block_id_idx").on(table.scheduleBlockId),
    uniqueIndex("schedule_entry_block_group_types_unique").on(
      table.scheduleBlockId,
      table.groupTypeKey,
    ),
  ],
);

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
    experienceLevelId: varchar("experience_level_id", {
      length: 255,
    }),
    scheduleEntryId: varchar("schedule_entry_id", { length: 255 }).notNull(),
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
      columns: [table.experienceLevelId],
      foreignColumns: [experienceLevels.id],
      name: "choreography_experience_level_fk",
    }),
    foreignKey({
      columns: [table.scheduleEntryId],
      foreignColumns: [scheduleEntries.id],
      name: "choreography_schedule_entry_fk",
    }),
    index("choreography_schedule_entry_id_idx").on(table.scheduleEntryId),
  ],
);

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
);

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
);
