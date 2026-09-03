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

// An emission snapshot already resolved against ARCA (CAE included). This layer
// does NOT call ARCA: it only persists the immutable row and its internal lines.
// The real emission (WSAA/WSFEv1 → CAE) lives in later slices (#445/#446).
export type RecordComprobanteInput = {
  choreographyId: string;
  eventId: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  // Service period and payment due date (Concepto 2, RG 1415) in ARCA's
  // `AAAAMMDD` format, frozen at emission. Nullable: comprobantes predating
  // ADR-0011 do not carry them.
  fchServDesde?: string | null;
  fchServHasta?: string | null;
  fchVtoPago?: string | null;
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
        fchServDesde: input.fchServDesde ?? null,
        fchServHasta: input.fchServHasta ?? null,
        fchVtoPago: input.fchVtoPago ?? null,
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

// Does the choreography have fiscal history? It counts any associated
// comprobante — `Factura C` or credit note, in force or annulled — because the
// existence of a single row already blocks the physical delete (#340) and is
// never released. A light check (LIMIT 1) for the server-side guard, independent
// of the UI.
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

// Every comprobante of a choreography, with its derived state and its internal
// lines. The mirror credit note anchors to the same choreography, so the set
// per choreography is self-contained for deriving `vigente`/`anulada`.
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
