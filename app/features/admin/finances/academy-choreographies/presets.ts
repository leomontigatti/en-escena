/**
 * The two cobro presets, as **list actions** over the selection of the open tab
 * of the academy's financial list: the choreographies, or the seminars. They are
 * the only surviving `Pagar seña` / `Pagar saldo`: each one pre-fills the owed
 * figure of what is selected and writes plain allocations. The choreography
 * ones ask for the price; the seminar ones price on the server.
 *
 * Shared by the view and the route action so both name the same intents and the
 * same field names. The stage itself is not defined here: which threshold a
 * cobro settles against is owned by the write path in `lib`, and this surface
 * only labels it.
 */

import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

const payDepositPresetIntent = "pay-deposit-preset";
const payBalancePresetIntent = "pay-balance-preset";

export const financePresetLabels = {
  deposit: "Pagar seña",
  balance: "Pagar saldo",
} as const satisfies Record<CobroStage, string>;

const paySeminarDepositPresetIntent = "pay-seminar-deposit-preset";
const paySeminarBalancePresetIntent = "pay-seminar-balance-preset";

export const choreographyIdFieldName = "choreographyId";
export const seminarIdFieldName = "seminarId";

/** What a preset acts on: the selection of the tab it was fired from. */
export type FinancePresetTarget = "choreographies" | "seminars";

export function financePresetIntent(
  stage: CobroStage,
  target: FinancePresetTarget = "choreographies",
): string {
  if (target === "seminars") {
    return stage === "deposit"
      ? paySeminarDepositPresetIntent
      : paySeminarBalancePresetIntent;
  }

  return stage === "deposit" ? payDepositPresetIntent : payBalancePresetIntent;
}

export function financePresetAction(
  intent: string,
): { stage: CobroStage; target: FinancePresetTarget } | null {
  switch (intent) {
    case payDepositPresetIntent:
      return { stage: "deposit", target: "choreographies" };
    case payBalancePresetIntent:
      return { stage: "balance", target: "choreographies" };
    case paySeminarDepositPresetIntent:
      return { stage: "deposit", target: "seminars" };
    case paySeminarBalancePresetIntent:
      return { stage: "balance", target: "seminars" };
    default:
      return null;
  }
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
 * A price row a preset may fix on an inscription. `scheduleIds` travels because
 * the writer refuses a special row that does not cover the choreography's
 * schedule, so the picker has to apply the very same rule.
 *
 * `depositAmount` travels already computed because the dialog projects what the
 * selection would owe against the picked row, and the percentage it comes from
 * belongs to the event and not to the price.
 */
export type PresetPriceOption = {
  amount: number;
  depositAmount: number;
  id: string;
  name: string;
  paymentDeadline: string | null;
  scheduleIds: readonly string[];
};

/**
 * The rows offered for one group type of the selection. The writer refuses a
 * special row that does not cover the choreography's schedule, so such a row is
 * a guaranteed refusal and is never offered.
 *
 * A pick has to be satisfiable for every choreography the preset is about to
 * write, so a special row is offered only when it covers every schedule of the
 * selection; the general rows always are. A choreography with no schedule
 * leaves only the general rows.
 */
export function selectPresetPriceOptions(input: {
  options: PresetPriceOption[];
  scheduleIds: Array<string | null>;
}): PresetPriceOption[] {
  return input.options.filter(
    (option) =>
      option.scheduleIds.length === 0 ||
      input.scheduleIds.every(
        (scheduleId) =>
          scheduleId !== null && option.scheduleIds.includes(scheduleId),
      ),
  );
}
