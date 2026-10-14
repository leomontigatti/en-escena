import { sql } from "drizzle-orm";
import { text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { createTable, documentType, uuidPrimaryKey } from "./core";

// The person behind an `individual` (`Particular`) account (ADR-0019). Its
// owner row is the `academy` row of kind `individual`, which holds its money
// and its phone; this row holds who the person is. The document is required
// and stored normalized through `app/lib/roster/identity-document.ts`: it is
// the key the link to academy rosters matches on.
export const individuals = createTable(
  "individual",
  {
    id: uuidPrimaryKey(),
    academyId: varchar("academy_id", { length: 255 })
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    documentType: documentType("document_type").notNull(),
    documentNumber: text("document_number").notNull(),
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
  (table) => [uniqueIndex("individual_academy_id_unique").on(table.academyId)],
).enableRLS();
