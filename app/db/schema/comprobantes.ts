import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { choreographies, choreographyDancers } from "./choreographies";
import { createTable } from "./core";
import { events } from "./events";

// The issuer's VAT condition, frozen in the snapshot. The issuer is
// `Proyecciones Artísticas Asociación Civil` (CUIT 30717611590), EXEMPT from VAT
// → it issues class C just like a monotributista (correction recorded in #426).
// The value is unique today; the enum documents that the column is a frozen
// snapshot, not a free-form field.
export const comprobanteIssuerIvaCondition = pgEnum(
  "en_escena_comprobante_issuer_iva_condition",
  ["exento"],
);

// `Comprobante` — ARCA electronic fiscal comprobante (`Factura C`, `CbteTipo` 11;
// `Nota de crédito C`, type 13). It is a DERIVED and IMMUTABLE document
// (#320/#326): it never governs financial state and, once emitted with a CAE,
// it is neither edited nor deleted. The `vigente`/`anulada` state is NOT
// persisted: it is derived from the existence of an associated credit note
// (see comprobante-status.server).
export const comprobantes = createTable(
  "comprobante",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    // Anchor choreography. No `onDelete cascade`: a choreography with fiscal
    // history cannot be physically deleted (hard invariant of #340), so the root
    // row always keeps its anchor alive and there are no orphan comprobantes.
    choreographyId: varchar("choreography_id", { length: 255 }).notNull(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    // ARCA comprobante type: 11 = `Factura C`, 13 = `Nota de crédito C`.
    cbteTipo: integer("cbte_tipo").notNull(),
    ptoVta: integer("pto_vta").notNull(),
    cbteNro: integer("cbte_nro").notNull(),
    // Comprobante date in ARCA's `AAAAMMDD` format.
    cbteFch: text("cbte_fch").notNull(),
    // Service period and payment due date (Concepto 2, RG 1415) in ARCA's
    // `AAAAMMDD` format. Nullable: only the comprobantes emitted from ADR-0011
    // onwards carry them; the pre-existing row was emitted as Concepto 1 (sale
    // of goods) and never carried service dates (rationale in ADR §3).
    fchServDesde: text("fch_serv_desde"),
    fchServHasta: text("fch_serv_hasta"),
    fchVtoPago: text("fch_vto_pago"),
    // Total amount in whole Argentine pesos (no cents, see finances.md).
    impTotal: integer("imp_total").notNull(),
    // Issuer snapshot. The CUIT is stored as text: 30717611590 exceeds the range
    // of a 32-bit integer.
    issuerCuit: text("issuer_cuit").notNull(),
    issuerIvaCondition: comprobanteIssuerIvaCondition(
      "issuer_iva_condition",
    ).notNull(),
    // Snapshot of the anonymous final-consumer recipient (#324): DocTipo 99 /
    // DocNro 0, with the recipient's VAT condition resolved against ARCA
    // (Consumidor Final). `doc_nro` is text in case a future recipient has a CUIT.
    receptorDocTipo: integer("receptor_doc_tipo").notNull(),
    receptorDocNro: text("receptor_doc_nro").notNull(),
    receptorIvaConditionId: integer("receptor_iva_condition_id").notNull(),
    cae: text("cae").notNull(),
    // CAE expiry in ARCA's `AAAAMMDD` format.
    caeVto: text("cae_vto").notNull(),
    // Associated comprobante: a credit note (type 13) points here at the
    // invoice it annuls (`CbtesAsoc`). Null on an invoice. From the invoice's
    // side, the existence of a row referencing it is what derives it to `anulada`.
    associatedComprobanteId: varchar("associated_comprobante_id", {
      length: 255,
    }),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  // Named foreign keys: the name Drizzle derives exceeds Postgres's 63-character
  // identifier limit and would be truncated. The names must match those in the
  // migration.
  (table) => [
    foreignKey({
      columns: [table.choreographyId],
      foreignColumns: [choreographies.id],
      name: "comprobante_choreography_fk",
    }),
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "comprobante_event_fk",
    }),
    foreignKey({
      columns: [table.associatedComprobanteId],
      foreignColumns: [table.id],
      name: "comprobante_associated_fk",
    }),
    uniqueIndex("comprobante_ptovta_tipo_nro_unique").on(
      table.ptoVta,
      table.cbteTipo,
      table.cbteNro,
    ),
    index("comprobante_choreography_idx").on(
      table.choreographyId,
      table.createdAt,
    ),
    index("comprobante_event_idx").on(table.eventId, table.createdAt),
    // Unique, not a plain index: it guarantees at the database level that a
    // comprobante has at most ONE associated credit note. The column is
    // nullable and Postgres treats NULLs as distinct, so the comprobantes in
    // force (all NULL) do not collide with each other. It closes the race
    // between two concurrent annulments of the same comprobante: without it,
    // `annulComprobante`'s `already-annulled` check reads derived state and makes
    // a non-transactional round trip to ARCA before persisting, so both could
    // insert their mirror credit note and leave the derived state ambiguous.
    uniqueIndex("comprobante_associated_unique").on(
      table.associatedComprobanteId,
    ),
  ],
).enableRLS();

// Internal lines of a comprobante, one per billed inscription (#323/#326). They
// are a snapshot: each row holds the amount billed for one inscription at
// emission time. Roster editing (adding or removing inscriptions) stays allowed
// even with comprobantes on the choreography (#340), so deleting an inscription
// nulls the link (`onDelete set null`) without losing the frozen amount; the
// fiscal figure lives in `imp_total` on the root row, which is immutable.
export const comprobanteInscriptions = createTable(
  "comprobante_inscription",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    comprobanteId: varchar("comprobante_id", { length: 255 }).notNull(),
    inscriptionId: varchar("inscription_id", { length: 255 }),
    amount: integer("amount").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.comprobanteId],
      foreignColumns: [comprobantes.id],
      name: "comprobante_inscription_comprobante_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.inscriptionId],
      foreignColumns: [choreographyDancers.id],
      name: "comprobante_inscription_inscription_fk",
    }).onDelete("set null"),
    uniqueIndex("comprobante_inscription_unique").on(
      table.comprobanteId,
      table.inscriptionId,
    ),
    index("comprobante_inscription_inscription_idx").on(table.inscriptionId),
  ],
).enableRLS();
