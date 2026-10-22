import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { createTable } from "./core";
import { events } from "./events";
import { choreographies } from "./choreographies";
import { seminars } from "./seminars";

// What is known about a reserved correlative while it is live. `unverified`
// is every reservation until ARCA settles it: one in flight, one whose request
// died with the process, and one ARCA left ambiguous all read the same, since
// in none of them do we know what ARCA did. `number-taken` is the one we do
// know about: ARCA holds a different comprobante at that number.
export const comprobanteReservationState = pgEnum(
  "en_escena_comprobante_reservation_state",
  ["unverified", "number-taken"],
);

// What the reservation needs to record the comprobante once ARCA authorizes it
// and that no constraint or read touches: the rest of the comprobante's
// snapshot (`RecordComprobanteInput` without the CAE and without the columns
// below), lines included. It is a payload in flight, not a domain entity.
export type ComprobanteReservationPayload = {
  fchServDesde: string | null;
  fchServHasta: string | null;
  fchVtoPago: string | null;
  issuerCuit: string;
  issuerIvaCondition: "exento";
  receptorDocTipo: number;
  receptorDocNro: string;
  receptorIvaConditionId: number;
  associatedComprobanteId: string | null;
  // Each line names exactly one inscription, as a comprobante's does.
  lines: Array<
    | { amount: number; choreographyInscriptionId: string }
    | { amount: number; seminarInscriptionId: string }
  >;
};

// `ComprobanteReservation` — a correlative taken before `FECAESolicitar`
// (ADR-0014 §7), so two emissions in one series cannot submit the same number.
// It lives apart from `comprobante` because a row without a CAE there would
// enter `FC + ΣND − ΣNC`. It is a lease, not a record: once the attempt is
// resolved — authorized, rejected, not emitted, or abandoned — the row is
// deleted, so a live reservation is one that exists.
export const comprobanteReservations = createTable(
  "comprobante_reservation",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    ptoVta: integer("pto_vta").notNull(),
    cbteTipo: integer("cbte_tipo").notNull(),
    cbteNro: integer("cbte_nro").notNull(),
    // The anchor the attempt bills, as on `comprobante`: exactly one of the two
    // references, plus the academy.
    choreographyId: varchar("choreography_id", { length: 255 }),
    seminarId: varchar("seminar_id", { length: 255 }),
    academyId: varchar("academy_id", { length: 255 }).notNull(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    // What was submitted, which a comprobante ARCA holds at this number must
    // match to be ours.
    impTotal: integer("imp_total").notNull(),
    cbteFch: text("cbte_fch").notNull(),
    state: comprobanteReservationState("state").notNull().default("unverified"),
    // On `number-taken`: what ARCA holds at the number, shown against what was
    // submitted so whoever abandons the attempt decides on the evidence.
    takenImpTotal: integer("taken_imp_total"),
    takenCbteFch: text("taken_cbte_fch"),
    payload: jsonb("payload").$type<ComprobanteReservationPayload>().notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    foreignKey({
      columns: [table.choreographyId],
      foreignColumns: [choreographies.id],
      name: "comprobante_reservation_choreography_fk",
    }),
    foreignKey({
      columns: [table.seminarId],
      foreignColumns: [seminars.id],
      name: "comprobante_reservation_seminar_fk",
    }),
    foreignKey({
      columns: [table.academyId],
      foreignColumns: [academies.id],
      name: "comprobante_reservation_academy_fk",
    }),
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "comprobante_reservation_event_fk",
    }),
    check(
      "comprobante_reservation_exactly_one_anchor",
      sql`num_nonnulls(${table.choreographyId}, ${table.seminarId}) = 1`,
    ),
    // A live reservation blocks its series, so a series holds at most one: the
    // index is the block, and it is also what makes two concurrent emissions
    // unable to take one number, since the loser's insert conflicts.
    uniqueIndex("comprobante_reservation_series_unique").on(
      table.ptoVta,
      table.cbteTipo,
    ),
  ],
).enableRLS();
