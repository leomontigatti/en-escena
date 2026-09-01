/**
 * The two cobro presets, as **list actions** over the choreographies selected in
 * the academy's financial list. They are the only surviving `Pagar seña` /
 * `Pagar saldo`: each one pre-fills the owed figure of what is selected, asks
 * for the price, and writes plain allocations.
 *
 * Shared by the view and the route action so both name the same intents and the
 * same field names. The stage itself is not defined here: which threshold a
 * cobro settles against is owned by the write path in `lib`, and this surface
 * only labels it.
 */

import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

export const payDepositPresetIntent = "pay-deposit-preset";
export const payBalancePresetIntent = "pay-balance-preset";

export const financePresetLabels = {
  deposit: "Pagar seña",
  balance: "Pagar saldo",
} as const satisfies Record<CobroStage, string>;

export const choreographyIdFieldName = "choreographyId";

export function financePresetIntent(stage: CobroStage): string {
  return stage === "deposit" ? payDepositPresetIntent : payBalancePresetIntent;
}

export function financePresetStage(intent: string): CobroStage | null {
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

/**
 * A price row a preset may fix on an inscription. `scheduleId` travels because
 * the writer refuses a row bound to a schedule other than the choreography's,
 * so the picker has to apply the very same rule.
 */
export type PresetPriceOption = {
  amount: number;
  id: string;
  name: string;
  paymentDeadline: string | null;
  scheduleId: string | null;
};

/**
 * The picker's default: leave every inscription on the price that already
 * resolves for it. It is a value rather than an empty option because Radix's
 * `Select` cannot hold one, and it travels to the server as no pick at all.
 *
 * It is the default because the figure the dialog shows was computed from the
 * prices that already resolve. Defaulting to a row of the catalogue would make
 * an administrator who only reads the figure and confirms re-price every
 * inscription that has not covered its seña, and allocate against a number they
 * never saw.
 */
export const keepCurrentPriceValue = "keep-current";

export const keepCurrentPriceLabel = "Mantener el precio actual";

/**
 * The rows offered for one group type of the selection. The writer refuses any
 * price tied to a schedule other than the choreography's, so a schedule-bound
 * row of another schedule is a guaranteed refusal and is never offered.
 *
 * When the selection spans more than one schedule, the rows common to all of
 * them are the general ones, and those are the only ones offered: a pick has to
 * be satisfiable for every choreography the preset is about to write.
 */
export function selectPresetPriceOptions(input: {
  options: PresetPriceOption[];
  scheduleIds: Array<string | null>;
}): PresetPriceOption[] {
  const scheduleIds = new Set(input.scheduleIds);
  const commonScheduleId =
    scheduleIds.size === 1 ? ([...scheduleIds][0] ?? null) : null;

  return input.options.filter(
    (option) =>
      option.scheduleId === null || option.scheduleId === commonScheduleId,
  );
}
