import { desc } from "drizzle-orm";

import { db } from "@/db";
import { comprobantes } from "@/db/schema";
import {
  comprobanteAnchorFilter,
  type ComprobanteAnchor,
} from "@/lib/comprobantes/anchor";

/** A row of a financial detail's `Comprobantes` tab. */
export type AnchorComprobanteRow = {
  id: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
};

/**
 * Every comprobante of one anchor, newest first: the invoice and the notes that
 * amend it, whatever their status. The date is ARCA's and has no time, and the
 * credit note numbers run in their own series, so on one day the newer is the
 * one recorded later.
 */
export async function readAnchorComprobantes(
  anchor: ComprobanteAnchor,
): Promise<AnchorComprobanteRow[]> {
  return await db
    .select({
      id: comprobantes.id,
      cbteTipo: comprobantes.cbteTipo,
      ptoVta: comprobantes.ptoVta,
      cbteNro: comprobantes.cbteNro,
      cbteFch: comprobantes.cbteFch,
      impTotal: comprobantes.impTotal,
    })
    .from(comprobantes)
    .where(comprobanteAnchorFilter(anchor))
    .orderBy(
      desc(comprobantes.cbteFch),
      desc(comprobantes.createdAt),
      desc(comprobantes.id),
    );
}
