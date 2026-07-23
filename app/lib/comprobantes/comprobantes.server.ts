import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { comprobanteInscriptions, comprobantes } from "@/db/schema";

import {
  deriveComprobanteStatus,
  type ComprobanteStatus,
} from "./comprobante-status.server";

type ComprobanteRow = typeof comprobantes.$inferSelect;
type ComprobanteInscriptionRow = typeof comprobanteInscriptions.$inferSelect;

export type ComprobanteLineInput = {
  inscriptionId: string | null;
  amount: number;
};

// Snapshot de emisión ya resuelto contra ARCA (CAE incluido). Esta capa NO llama
// a ARCA: sólo persiste la fila inmutable y sus líneas internas. La emisión real
// (WSAA/WSFEv1 → CAE) vive en slices posteriores (#445/#446).
export type RecordComprobanteInput = {
  choreographyId: string;
  eventId: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
  issuerCuit: string;
  issuerIvaCondition: ComprobanteRow["issuerIvaCondition"];
  receptorDocTipo: number;
  receptorDocNro: string;
  receptorIvaConditionId: number;
  cae: string;
  caeVto: string;
  associatedComprobanteId?: string | null;
  lines: ComprobanteLineInput[];
};

export type ComprobanteWithLines = ComprobanteRow & {
  status: ComprobanteStatus;
  lines: ComprobanteInscriptionRow[];
};

export async function recordComprobante(
  input: RecordComprobanteInput,
): Promise<ComprobanteRow> {
  return await db.transaction(async (tx) => {
    const [comprobante] = await tx
      .insert(comprobantes)
      .values({
        choreographyId: input.choreographyId,
        eventId: input.eventId,
        cbteTipo: input.cbteTipo,
        ptoVta: input.ptoVta,
        cbteNro: input.cbteNro,
        cbteFch: input.cbteFch,
        impTotal: input.impTotal,
        issuerCuit: input.issuerCuit,
        issuerIvaCondition: input.issuerIvaCondition,
        receptorDocTipo: input.receptorDocTipo,
        receptorDocNro: input.receptorDocNro,
        receptorIvaConditionId: input.receptorIvaConditionId,
        cae: input.cae,
        caeVto: input.caeVto,
        associatedComprobanteId: input.associatedComprobanteId ?? null,
      })
      .returning();

    if (input.lines.length > 0) {
      await tx.insert(comprobanteInscriptions).values(
        input.lines.map((line) => ({
          comprobanteId: comprobante.id,
          inscriptionId: line.inscriptionId,
          amount: line.amount,
        })),
      );
    }

    return comprobante;
  });
}

// ¿La coreografía tiene historia fiscal? Cuenta cualquier comprobante asociado
// —Factura C o Nota de crédito, vigente o anulada— porque la existencia de una
// sola fila ya bloquea el borrado físico (#340) y nunca se libera. Chequeo liviano
// (LIMIT 1) para la guarda server-side, independiente de la UI.
export async function choreographyHasComprobantes(
  choreographyId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: comprobantes.id })
    .from(comprobantes)
    .where(eq(comprobantes.choreographyId, choreographyId))
    .limit(1);

  return rows.length > 0;
}

// Todos los comprobantes de una coreografía, con su estado derivado y sus líneas
// internas. La Nota de crédito espejo se ancla a la misma coreografía, así que
// el conjunto por coreografía es autocontenido para derivar `vigente`/`anulada`.
export async function listChoreographyComprobantes(
  choreographyId: string,
): Promise<ComprobanteWithLines[]> {
  const rows = await db
    .select()
    .from(comprobantes)
    .where(eq(comprobantes.choreographyId, choreographyId))
    .orderBy(asc(comprobantes.createdAt));

  const lines = await Promise.all(
    rows.map((row) =>
      db
        .select()
        .from(comprobanteInscriptions)
        .where(eq(comprobanteInscriptions.comprobanteId, row.id)),
    ),
  );

  return rows.map((row, index) => ({
    ...row,
    status: deriveComprobanteStatus(row, rows),
    lines: lines[index],
  }));
}
