import type { ChoreographyFinancialState } from "@/lib/finances/operational-summary";

export type InscriptionAmountColumn = "basePrice" | "deposit" | "balance";

/**
 * Importes todavía sujetos a cambio, por estado. El precio base y la seña se
 * fijan al pagar la seña; el saldo recién al pagar el saldo, porque hasta ese
 * momento el `Descuento por bailarín` sigue el roster.
 */
const tentativeColumnsByState: Record<
  ChoreographyFinancialState,
  ReadonlySet<InscriptionAmountColumn>
> = {
  impaga: new Set<InscriptionAmountColumn>(["basePrice", "deposit", "balance"]),
  señada: new Set<InscriptionAmountColumn>(["balance"]),
  pagada: new Set<InscriptionAmountColumn>(),
};

export function isTentativeInscriptionAmount(
  state: ChoreographyFinancialState,
  column: InscriptionAmountColumn,
) {
  return tentativeColumnsByState[state].has(column);
}
