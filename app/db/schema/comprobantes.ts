import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { choreographies, choreographyDancers } from "./choreographies";
import { createTable } from "./core";
import { events } from "./events";
import { seminarInscriptions, seminars } from "./seminars";

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
// `Nota de débito C`, 12; `Nota de crédito C`, 13; see kind.ts). It is a
// DERIVED and IMMUTABLE document (#320/#326): it never governs financial state
// and, once emitted with a CAE, it is neither edited nor deleted. An invoice's
// status is NOT persisted: it is derived by amount from the notes associated
// with it (see comprobante-status.server).
export const comprobantes = createTable(
  "comprobante",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    // The ANCHOR, of either kind: exactly one of the two is set. A choreography
    // comprobante bills one choreography; a seminar comprobante bills what one
    // academy holds in one seminar, and the pair `(seminar, academy)` is the
    // obligation unit there — the exact twin of "one per choreography". Every
    // rule that used to read "same choreography" reads "same anchor": the
    // delta, the amendment star, the emission lock and the deletion block.
    //
    // Neither reference cascades: an anchor with fiscal history cannot be
    // physically deleted (hard invariant of #340, extended to the seminar), so
    // the root row always keeps its anchor alive and there are no orphan
    // comprobantes.
    choreographyId: varchar("choreography_id", { length: 255 }),
    seminarId: varchar("seminar_id", { length: 255 }),
    // The academy the comprobante is issued to. It is a column of the root and
    // not a join through the anchor because a seminar has no single academy:
    // the unit is the pair. On a choreography row it is the choreography's own
    // academy, which is where every pre-existing row's value was backfilled
    // from.
    academyId: varchar("academy_id", { length: 255 }).notNull(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    // ARCA comprobante type, read only through kind.ts.
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
    // Associated comprobante: a note points here at its unit's invoice
    // (`CbtesAsoc`), never at another note. Null on an invoice. From the
    // invoice's side, the notes referencing it are what its status is derived
    // from.
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
      columns: [table.seminarId],
      foreignColumns: [seminars.id],
      name: "comprobante_seminar_fk",
    }),
    foreignKey({
      columns: [table.academyId],
      foreignColumns: [academies.id],
      name: "comprobante_academy_fk",
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
    // Exactly one, unlike the line's `at most one`: a comprobante with no anchor
    // bills nothing, and one with two would belong to two units at once.
    check(
      "comprobante_exactly_one_anchor",
      sql`num_nonnulls(${table.choreographyId}, ${table.seminarId}) = 1`,
    ),
    uniqueIndex("comprobante_ptovta_tipo_nro_unique").on(
      table.ptoVta,
      table.cbteTipo,
      table.cbteNro,
    ),
    index("comprobante_choreography_idx").on(
      table.choreographyId,
      table.createdAt,
    ),
    index("comprobante_seminar_idx").on(
      table.seminarId,
      table.academyId,
      table.createdAt,
    ),
    index("comprobante_event_idx").on(table.eventId, table.createdAt),
    // Every note anchors at its unit's invoice (the star, ADR-0014 §5), so an
    // invoice gathers any number of them: what bounds them is the crediting
    // ceiling the emitter checks under the anchor's lock, not an index.
    index("comprobante_associated_idx").on(table.associatedComprobanteId),
  ],
).enableRLS();

// Internal lines of a comprobante, one per billed inscription (#323/#326) at
// the amount billed for it, net of discounts. They are a snapshot: the fiscal
// figure lives in `imp_total` on the root row, and the lines of every
// comprobante sum to it. A line always names its inscription: the roster
// withdraws an invoiced inscription rather than deleting it (#600), so the
// references do not act on delete, and a delete that got past the roster is
// refused instead of leaving a line `FC + ΣND − ΣNC` could no longer place.
export const comprobanteInscriptions = createTable(
  "comprobante_inscription",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    comprobanteId: varchar("comprobante_id", { length: 255 }).notNull(),
    // The billed inscription, of either kind: exactly one of the two is set.
    choreographyInscriptionId: varchar("choreography_inscription_id", {
      length: 255,
    }),
    seminarInscriptionId: varchar("seminar_inscription_id", { length: 255 }),
    amount: integer("amount").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.comprobanteId],
      foreignColumns: [comprobantes.id],
      name: "comprobante_inscription_comprobante_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.choreographyInscriptionId],
      foreignColumns: [choreographyDancers.id],
      name: "comprobante_inscription_choreography_fk",
    }),
    foreignKey({
      columns: [table.seminarInscriptionId],
      foreignColumns: [seminarInscriptions.id],
      name: "comprobante_inscription_seminar_fk",
    }),
    // One partial unique index per kind: each covers only the lines of its
    // own kind, which are the rows where its column is set.
    uniqueIndex("comprobante_inscription_choreography_unique")
      .on(table.comprobanteId, table.choreographyInscriptionId)
      .where(sql`${table.choreographyInscriptionId} is not null`),
    uniqueIndex("comprobante_inscription_seminar_unique")
      .on(table.comprobanteId, table.seminarInscriptionId)
      .where(sql`${table.seminarInscriptionId} is not null`),
    check(
      "comprobante_inscription_exactly_one_target",
      sql`num_nonnulls(${table.choreographyInscriptionId}, ${table.seminarInscriptionId}) = 1`,
    ),
    index("comprobante_inscription_choreography_idx").on(
      table.choreographyInscriptionId,
    ),
    index("comprobante_inscription_seminar_idx").on(table.seminarInscriptionId),
  ],
).enableRLS();
