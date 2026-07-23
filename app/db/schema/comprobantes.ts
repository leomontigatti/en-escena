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

// Condición IVA del emisor, congelada en el snapshot. El emisor es Proyecciones
// Artísticas Asociación Civil (CUIT 30717611590), EXENTA frente al IVA → emite
// clase C igual que un monotributista (corrección registrada en #426). El valor
// es único hoy; el enum documenta que la columna es un snapshot congelado, no un
// campo libre.
export const comprobanteIssuerIvaCondition = pgEnum(
  "en_escena_comprobante_issuer_iva_condition",
  ["exento"],
);

// `Comprobante` — comprobante fiscal electrónico ARCA (Factura C, `CbteTipo` 11;
// Nota de crédito C, tipo 13). Es un documento DERIVADO e INMUTABLE (#320/#326):
// nunca gobierna el estado financiero y, una vez emitido con CAE, no se edita ni
// se borra. El estado `vigente`/`anulada` NO se persiste: se deriva de la
// existencia de una Nota de crédito asociada (ver comprobante-status.server).
export const comprobantes = createTable(
  "comprobante",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    // Coreografía ancla. Sin `onDelete cascade`: una coreografía con historia
    // fiscal no puede borrarse físicamente (invariante duro de #340), así que la
    // fila raíz siempre conserva su ancla viva y no existen comprobantes
    // huérfanos.
    choreographyId: varchar("choreography_id", { length: 255 }).notNull(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    // Tipo de comprobante ARCA: 11 = Factura C, 13 = Nota de crédito C.
    cbteTipo: integer("cbte_tipo").notNull(),
    ptoVta: integer("pto_vta").notNull(),
    cbteNro: integer("cbte_nro").notNull(),
    // Fecha del comprobante en formato ARCA `AAAAMMDD`.
    cbteFch: text("cbte_fch").notNull(),
    // Importe total en pesos argentinos enteros (sin centavos, ver finanzas.md).
    impTotal: integer("imp_total").notNull(),
    // Snapshot del emisor. El CUIT se guarda como texto: 30717611590 excede el
    // rango de un integer de 32 bits.
    issuerCuit: text("issuer_cuit").notNull(),
    issuerIvaCondition: comprobanteIssuerIvaCondition(
      "issuer_iva_condition",
    ).notNull(),
    // Snapshot del receptor consumidor final anónimo (#324): DocTipo 99 /
    // DocNro 0, con la condición IVA del receptor resuelta contra ARCA
    // (Consumidor Final). `doc_nro` es texto por si un receptor futuro trae CUIT.
    receptorDocTipo: integer("receptor_doc_tipo").notNull(),
    receptorDocNro: text("receptor_doc_nro").notNull(),
    receptorIvaConditionId: integer("receptor_iva_condition_id").notNull(),
    cae: text("cae").notNull(),
    // Vencimiento del CAE en formato ARCA `AAAAMMDD`.
    caeVto: text("cae_vto").notNull(),
    // Comprobante asociado: una Nota de crédito (tipo 13) apunta acá a la factura
    // que anula (`CbtesAsoc`). Null en una factura. Del lado de la factura, la
    // existencia de una fila que la referencia es lo que la deriva a `anulada`.
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
  // Foreign keys nombradas: el nombre que deriva Drizzle supera los 63
  // caracteres de un identificador de Postgres y se truncaría. Los nombres deben
  // coincidir con los de la migración.
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
    // Único, no un índice común: garantiza a nivel de base que un comprobante
    // tenga como máximo UNA Nota de crédito asociada. La columna es nullable y
    // Postgres trata los NULL como distintos, así que las facturas vigentes
    // (todas NULL) no colisionan entre sí. Cierra la carrera de dos anulaciones
    // concurrentes del mismo comprobante: sin esto, el chequeo `already-annulled`
    // de `annulComprobante` lee estado derivado y hace un round-trip a ARCA no
    // transaccional antes de persistir, así que ambas podrían insertar su Nota de
    // crédito espejo y dejar el estado derivado ambiguo.
    uniqueIndex("comprobante_associated_unique").on(
      table.associatedComprobanteId,
    ),
  ],
).enableRLS();

// Líneas internas del comprobante, una por inscripción facturada (#323/#326).
// Son un snapshot: guardan la porción facturada de cada inscripción al momento
// de emitir. La edición de roster (agregar/quitar inscripciones) sigue permitida
// aún con comprobantes (#340), así que el vínculo a la inscripción se anula al
// borrarla (`onDelete set null`) sin perder el monto congelado; el importe fiscal
// vive en `imp_total` de la fila raíz, que es inmutable.
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
