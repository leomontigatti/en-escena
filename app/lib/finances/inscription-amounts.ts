import type { InscriptionFinancialStatus } from "@/lib/finances/inscription-financial-status";

export type InscriptionAmountColumn = "basePrice" | "deposit" | "total";

/**
 * Importes que la pantalla todavía atenúa por considerarlos provisorios.
 *
 * Ya no describe el modelo: desde que las cifras se derivan, todas son exactas
 * y ninguna está congelada. Queda sólo como la señal visual que #683 borra.
 */
const tentativeColumnsByStatus: Record<
  InscriptionFinancialStatus,
  ReadonlySet<InscriptionAmountColumn>
> = {
  depositPending: new Set<InscriptionAmountColumn>([
    "basePrice",
    "deposit",
    "total",
  ]),
  depositMet: new Set<InscriptionAmountColumn>(["total"]),
  paidInFull: new Set<InscriptionAmountColumn>(),
};

export function isTentativeInscriptionAmount(
  status: InscriptionFinancialStatus,
  column: InscriptionAmountColumn,
) {
  return tentativeColumnsByStatus[status].has(column);
}
