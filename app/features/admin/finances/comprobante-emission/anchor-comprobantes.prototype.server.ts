// PROTOTYPE (#726), throwaway: every comprobante of one anchor, for the
// `Comprobantes` tab of the two financial details. Not production code.
import { desc } from "drizzle-orm";

import { db } from "@/db";
import { comprobantes } from "@/db/schema";
import {
  comprobanteAnchorFilter,
  type ComprobanteAnchor,
} from "@/lib/comprobantes/anchor";

export type AnchorComprobanteRow = {
  id: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
  // The comprobante a note amends, by its own id, resolved to a number by the
  // view from the same rows (both always share the anchor).
  associatedComprobanteId: string | null;
};

export async function readAnchorComprobantesPrototype(
  anchor: ComprobanteAnchor,
): Promise<AnchorComprobanteRow[]> {
  return db
    .select({
      id: comprobantes.id,
      cbteTipo: comprobantes.cbteTipo,
      ptoVta: comprobantes.ptoVta,
      cbteNro: comprobantes.cbteNro,
      cbteFch: comprobantes.cbteFch,
      impTotal: comprobantes.impTotal,
      associatedComprobanteId: comprobantes.associatedComprobanteId,
    })
    .from(comprobantes)
    .where(comprobanteAnchorFilter(anchor))
    .orderBy(desc(comprobantes.cbteFch), desc(comprobantes.cbteNro));
}
