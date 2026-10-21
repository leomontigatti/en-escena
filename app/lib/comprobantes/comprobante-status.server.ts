import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { comprobantes } from "@/db/schema";

import { comprobanteKindCbteTipo, readComprobanteKind } from "./kind";

// The derived state of an invoice (#657, ADR-0014 §5), never persisted. It is an
// amount comparison over the star: every debit note and credit note
// anchors at the invoice itself (`associatedComprobanteId`), so the set is
// closed and the status is a property of the invoice alone.
//
// - `annulled` (ui: `Anulada`) when the credit notes cover everything billed,
//   ΣNC ≥ FC + ΣND.
// - `adjusted` (ui: `Ajustada`) when some note amends it and ΣNC is below that.
// - `valid` (ui: `Vigente`) when nothing amends it.
//
// The notes themselves, and a comprobante of an unknown kind, carry no status:
// `null`. `deriveComprobanteStatus` and `comprobanteStatusSql` are the two
// derivations, and the parity DB test holds them to one answer per row.

export type ComprobanteStatus = "valid" | "adjusted" | "annulled";

export function deriveComprobanteStatus(
  comprobante: { id: string; cbteTipo: number; impTotal: number },
  comprobantesInScope: ReadonlyArray<{
    associatedComprobanteId: string | null;
    cbteTipo: number;
    impTotal: number;
  }>,
): ComprobanteStatus | null {
  if (readComprobanteKind(comprobante.cbteTipo).kind !== "factura_c") {
    return null;
  }

  let debited = 0;
  let credited = 0;
  let amended = false;

  for (const candidate of comprobantesInScope) {
    if (candidate.associatedComprobanteId !== comprobante.id) {
      continue;
    }

    const { kind } = readComprobanteKind(candidate.cbteTipo);

    if (kind === "nota_debito_c") {
      debited += candidate.impTotal;
      amended = true;
    } else if (kind === "nota_credito_c") {
      credited += candidate.impTotal;
      amended = true;
    }
  }

  if (!amended) {
    return "valid";
  }

  return credited >= comprobante.impTotal + debited ? "annulled" : "adjusted";
}

/**
 * The SQL twin of `deriveComprobanteStatus`, correlated with the outer
 * `comprobantes` row, for a list that filters and paginates on the status. It
 * reads the star and nothing else: no event condition, which is what used to
 * let the two derivations disagree when a note was recorded under another
 * event than its invoice.
 */
export function comprobanteStatusSql(): SQL<ComprobanteStatus | null> {
  const amendment = alias(comprobantes, "amendment");
  const facturaC = comprobanteKindCbteTipo("factura_c");
  const notaDebitoC = comprobanteKindCbteTipo("nota_debito_c");
  const notaCreditoC = comprobanteKindCbteTipo("nota_credito_c");
  // ΣNC − ΣND over the star, `null` when nothing amends the invoice. The
  // comparison with the invoice's own amount stays outside the subquery,
  // where the outer column keeps its table qualifier.
  const netCredited = db
    .select({
      net: sql`sum(case when ${amendment.cbteTipo} = ${notaCreditoC} then ${amendment.impTotal} else -${amendment.impTotal} end)`,
    })
    .from(amendment)
    .where(
      and(
        eq(amendment.associatedComprobanteId, comprobantes.id),
        inArray(amendment.cbteTipo, [notaDebitoC, notaCreditoC]),
      ),
    );

  return sql<ComprobanteStatus | null>`case when ${comprobantes.cbteTipo} = ${facturaC} then
    case
      when (${netCredited}) is null then 'valid'
      when (${netCredited}) >= ${comprobantes.impTotal} then 'annulled'
      else 'adjusted'
    end
  end`;
}
