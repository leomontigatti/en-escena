import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { createTable, documentType } from "./core";

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
    // The number alone is the key within an academy: the same person loaded as
    // `dni` and as `otro` is one person (PRD #1090). Archived rows stay in the
    // index — an archived dancer still holds their document.
    uniqueIndex("dancer_academy_document_number_unique")
      .on(table.academyId, table.documentNumber)
      .where(sql`${table.documentNumber} is not null`),
  ],
).enableRLS();

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
    // Same rule as the dancers', and it never crosses the two tables: a teacher
    // who also dances is one dancer row and one professor row (PRD #1090).
    uniqueIndex("professor_academy_document_number_unique")
      .on(table.academyId, table.documentNumber)
      .where(sql`${table.documentNumber} is not null`),
  ],
).enableRLS();
