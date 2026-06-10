import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
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

export const session = createTable(
  "session",
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
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = createTable(
  "account",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
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
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = createTable(
  "verification",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
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
  (table) => [index("verification_identifier_idx").on(table.identifier)],
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
    uniqueIndex("submodality_event_name_unique").on(table.eventId, table.name),
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
    categoryId: varchar("category_id", { length: 255 })
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    modalityId: varchar("modality_id", { length: 255 })
      .notNull()
      .references(() => modalities.id),
  },
  (table) => [
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
    categoryId: varchar("category_id", { length: 255 })
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    experienceLevelId: varchar("experience_level_id", { length: 255 })
      .notNull()
      .references(() => experienceLevels.id),
  },
  (table) => [
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
