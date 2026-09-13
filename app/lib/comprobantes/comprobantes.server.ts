import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  comprobanteInscriptions,
  comprobantes,
} from "@/db/schema";

import {
  comprobanteAnchorColumns,
  comprobanteAnchorFilter,
  type ComprobanteAnchor,
} from "./anchor";
import {
  deriveComprobanteStatus,
  type ComprobanteStatus,
} from "./comprobante-status.server";

type ComprobanteRow = typeof comprobantes.$inferSelect;
type ComprobanteInscriptionRow = typeof comprobanteInscriptions.$inferSelect;

// One billed inscription, of either kind. At most one of the two ids is set:
// both null is the shape a line survives in once its inscription was hard
// deleted, which is the only reason the frozen amount is on the line at all.
export type ComprobanteLineInput = {
  amount: number;
  choreographyInscriptionId?: string | null;
  seminarInscriptionId?: string | null;
};

// An emission snapshot already resolved against ARCA (CAE included). This layer
// does NOT call ARCA: it only persists the immutable row and its internal lines.
// The real emission (WSAA/WSFEv1 → CAE) lives in later slices (#445/#446).
export type RecordComprobanteInput = {
  anchor: ComprobanteAnchor;
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
    const academyId = await resolveComprobanteAcademyId(tx, input.anchor);
    const [comprobante] = await tx
      .insert(comprobantes)
      .values({
        ...comprobanteAnchorColumns(input.anchor),
        academyId,
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
          choreographyInscriptionId: line.choreographyInscriptionId ?? null,
          seminarInscriptionId: line.seminarInscriptionId ?? null,
          amount: line.amount,
        })),
      );
    }

    return comprobante;
  });
}

/**
 * The academy the root records. A seminar names several, so the emission input
 * chooses; a choreography names one, so it is derived — the same derivation the
 * backfill applied to every row that predates the column, which is what keeps
 * the two kinds from disagreeing about what the column means.
 */
async function resolveComprobanteAcademyId(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  anchor: ComprobanteAnchor,
): Promise<string> {
  if (anchor.kind === "seminar") {
    return anchor.academyId;
  }

  const [choreography] = await tx
    .select({ academyId: choreographies.academyId })
    .from(choreographies)
    .where(eq(choreographies.id, anchor.choreographyId));

  if (!choreography) {
    throw new Error(
      `Cannot record a comprobante for unknown choreography ${anchor.choreographyId}.`,
    );
  }

  return choreography.academyId;
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

/**
 * The same question for a seminar, and deliberately NOT keyed on the academy:
 * the deletion block is about the seminar, so a comprobante any academy holds
 * in it is enough. Like the choreography's, it is never released.
 */
export async function seminarHasComprobantes(
  seminarId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: comprobantes.id })
    .from(comprobantes)
    .where(eq(comprobantes.seminarId, seminarId))
    .limit(1);

  return rows.length > 0;
}

/**
 * Every comprobante of ONE anchor, with its derived state and its internal
 * lines. The mirror credit note anchors to the same unit, so the set per anchor
 * is self-contained for deriving `vigente`/`anulada` — which is what makes a
 * comprobante annullable only by another of its own anchor.
 */
export async function listAnchorComprobantes(
  anchor: ComprobanteAnchor,
): Promise<ComprobanteWithLines[]> {
  const rows = await db
    .select()
    .from(comprobantes)
    .where(comprobanteAnchorFilter(anchor))
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
