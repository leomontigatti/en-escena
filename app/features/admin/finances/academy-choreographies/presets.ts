import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

/**
 * The two cobro presets, as **list actions** over the choreographies selected in
 * the academy's financial list. They are the only surviving `Pagar seña` /
 * `Pagar saldo`: each one pre-fills the owed figure of what is selected, asks
 * for the price, and writes plain allocations.
 *
 * Shared by the view and the route action so both name the same intents and the
 * same field names.
 */
export type FinancePresetStage = "deposit" | "balance";

export const payDepositPresetIntent = "pay-deposit-preset";
export const payBalancePresetIntent = "pay-balance-preset";

export const financePresetLabels = {
  deposit: "Pagar seña",
  balance: "Pagar saldo",
} as const satisfies Record<FinancePresetStage, string>;

export const choreographyIdFieldName = "choreographyId";

export function financePresetIntent(stage: FinancePresetStage): string {
  return stage === "deposit" ? payDepositPresetIntent : payBalancePresetIntent;
}

export function financePresetStage(intent: string): FinancePresetStage | null {
  if (intent === payDepositPresetIntent) {
    return "deposit";
  }

  if (intent === payBalancePresetIntent) {
    return "balance";
  }

  return null;
}

/**
 * One price field per group type in the selection: the picker filters to the
 * choreography's group type, so a selection spanning two group types asks
 * twice rather than offering a row that would create a forbidden state.
 */
export function presetPriceFieldName(groupType: ChoreographyGroupType): string {
  return `price-${groupType}`;
}
