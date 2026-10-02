import { sql } from "drizzle-orm";
import { text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import { user } from "./access";
import { createTable } from "./core";

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
    // Where the academy is: free text, because academies come from any
    // province or neighbouring country. Null on academies registered before
    // the fields existed; every form that saves the academy requires both.
    city: text("city"),
    province: text("province"),
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
