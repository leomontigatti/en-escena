import { sql } from "drizzle-orm";
import {
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { user } from "./access";
import { createTable } from "./core";

// The 24 Argentine jurisdictions, and `otro_pais` for an academy from abroad.
// The labels the forms and the reports show live in
// `app/lib/academies/provinces.ts`, which a test keeps in step with this list.
export const province = pgEnum("en_escena_province", [
  "buenos_aires",
  "caba",
  "catamarca",
  "chaco",
  "chubut",
  "cordoba",
  "corrientes",
  "entre_rios",
  "formosa",
  "jujuy",
  "la_pampa",
  "la_rioja",
  "mendoza",
  "misiones",
  "neuquen",
  "rio_negro",
  "salta",
  "san_juan",
  "san_luis",
  "santa_cruz",
  "santa_fe",
  "santiago_del_estero",
  "tierra_del_fuego",
  "tucuman",
  "otro_pais",
]);

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
    // Where the academy is: the city is free text, the province one of a
    // closed list (`Otro país` for an academy from abroad). Null on academies
    // registered before the fields existed; every form that saves the academy
    // requires both.
    city: text("city"),
    province: province("province"),
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
).enableRLS();
