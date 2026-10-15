import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, comprobantes, seminars } from "@/db/schema";

import { readAnchorFromJoins } from "./anchor-context.server";
import type { ComprobanteAnchorReading } from "./anchor-reading";
import {
  deriveComprobanteStatus,
  type ComprobanteStatus,
} from "./comprobante-status.server";

/** One comprobante as its owner reads it: the fiscal numbering, the amount,
 * what it was issued for and its derived state. */
export type OwnerComprobanteRow = {
  id: string;
  anchor: ComprobanteAnchorReading;
  cbteFch: string;
  cbteNro: number;
  cbteTipo: number;
  impTotal: number;
  ptoVta: number;
  status: ComprobanteStatus;
};

/**
 * Every comprobante one owner holds in one event, newest first: what an
 * individual reads in its `Finanzas` (ADR-0019). A credit note anchors to the
 * same unit as the invoice it annuls, and so to the same owner, which makes
 * the owner's set self-contained for deriving `valid`/`annulled`.
 */
export async function listOwnerEventComprobantes(input: {
  academyId: string;
  eventId: string;
}): Promise<OwnerComprobanteRow[]> {
  const rows = await db
    .select({
      id: comprobantes.id,
      associatedComprobanteId: comprobantes.associatedComprobanteId,
      cbteFch: comprobantes.cbteFch,
      cbteNro: comprobantes.cbteNro,
      cbteTipo: comprobantes.cbteTipo,
      impTotal: comprobantes.impTotal,
      ptoVta: comprobantes.ptoVta,
      choreographyId: comprobantes.choreographyId,
      choreographyName: choreographies.name,
      seminarId: comprobantes.seminarId,
      instructorName: seminars.instructorName,
      scheduledDate: seminars.scheduledDate,
    })
    .from(comprobantes)
    .leftJoin(
      choreographies,
      eq(comprobantes.choreographyId, choreographies.id),
    )
    .leftJoin(seminars, eq(comprobantes.seminarId, seminars.id))
    .where(
      and(
        eq(comprobantes.academyId, input.academyId),
        eq(comprobantes.eventId, input.eventId),
      ),
    )
    .orderBy(desc(comprobantes.cbteFch), desc(comprobantes.cbteNro));

  return rows.map((row) => ({
    id: row.id,
    anchor: readAnchorFromJoins(row),
    cbteFch: row.cbteFch,
    cbteNro: row.cbteNro,
    cbteTipo: row.cbteTipo,
    impTotal: row.impTotal,
    ptoVta: row.ptoVta,
    status: deriveComprobanteStatus(row, rows),
  }));
}
