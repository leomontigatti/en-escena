import { sql } from "drizzle-orm";
import {
  foreignKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { user } from "./access";
import { academies } from "./academies";
import { createTable, documentType, uuidPrimaryKey } from "./core";

// The person behind an `individual` (`Particular`) account (ADR-0019). Its
// owner row is the `academy` row of kind `individual`, which holds its money
// and its phone; this row holds who the person is. The document is required
// and stored normalized through `app/lib/roster/identity-document.ts`: it is
// the key the link to academy rosters matches on. The document photo is the
// one image administration compares with that document before confirming the
// link; it is not dancer verification.
//
// The link confirmation is administration's word that the document is the
// person's: when, by whom, and the normalized number it was confirmed for. It
// applies only while that number equals `document_number`, so editing the
// document clears it with no write of its own, and the derived link state
// (`app/lib/individuals/link-state.ts`) goes back to `Pendiente`.
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
    documentPhotoStorageKey: text("document_photo_storage_key"),
    linkConfirmedAt: timestamp("link_confirmed_at", {
      mode: "date",
      withTimezone: true,
    }),
    linkConfirmedByUserId: varchar("link_confirmed_by_user_id", {
      length: 255,
    }),
    linkConfirmedDocumentNumber: text("link_confirmed_document_number"),
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
    uniqueIndex("individual_academy_id_unique").on(table.academyId),
    // Named by hand: the generated name runs past Postgres's 63 bytes.
    foreignKey({
      columns: [table.linkConfirmedByUserId],
      foreignColumns: [user.id],
      name: "individual_link_confirmed_by_fk",
    }).onDelete("set null"),
  ],
).enableRLS();
