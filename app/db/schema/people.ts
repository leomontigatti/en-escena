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
    uniqueIndex("dancer_academy_document_unique")
      .on(table.academyId, table.documentType, table.documentNumber)
      .where(
        sql`${table.documentType} is not null and ${table.documentNumber} is not null`,
      ),
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
    uniqueIndex("professor_academy_document_unique")
      .on(table.academyId, table.documentType, table.documentNumber)
      .where(
        sql`${table.documentType} is not null and ${table.documentNumber} is not null`,
      ),
  ],
).enableRLS();
