import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";

import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";
import {
  resolveSelectedOperationalTotals,
  sumOperationalFinanceRows,
} from "@/lib/finances/selected-operational-totals";

/** The tab the page opens on, and the one the URL does not have to name. */
export const choreographiesTabValue = "coreografias";
export const seminarsTabValue = "seminarios";
const financeTabParam = "seccion";

/** What a financial list's row has to carry for a tab to sum it. */
type FinanceTabRow = {
  depositAmount: OperationalFinanceAmount;
  id: string;
  owedBalanceAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
};

/**
 * The state both financial lists — the panel's academy page and the portal's
 * summary — keep behind their two tabs. The two screens differ in what they let
 * the reader *do* with a selection (only the administrator collects), and in
 * nothing else about how the tabs behave, so this is one hook rather than the
 * same twenty lines twice.
 *
 * **One selection per tab, kept side by side.** They are not one state narrowed
 * by the active tab: switching tabs and coming back would then have silently
 * dropped what was selected on the other one.
 *
 * The four threshold-and-owed figures follow the active tab: they are that
 * kind's debt, summed over that kind's rows. `Saldo disponible` is not here on
 * purpose — it is the academy's pool, one for both kinds, and it never moves
 * with the tab.
 */
export function useFinanceTabs<
  TChoreographyRow extends FinanceTabRow,
  TSeminarRow extends FinanceTabRow,
>(input: {
  choreographyFinanceRows: TChoreographyRow[];
  seminarFinanceRows: TSeminarRow[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab =
    searchParams.get(financeTabParam) === seminarsTabValue
      ? seminarsTabValue
      : choreographiesTabValue;
  const [selectedChoreographyIds, setSelectedChoreographyIds] = useState<
    string[]
  >([]);
  const [selectedSeminarIds, setSelectedSeminarIds] = useState<string[]>([]);
  const choreographyThresholds = sumOperationalFinanceRows(
    input.choreographyFinanceRows,
  );
  const seminarThresholds = sumOperationalFinanceRows(input.seminarFinanceRows);
  // The collection operates on the selection, so the two owed figures follow
  // it: leaving them at the tab's total forces adding up from memory how much
  // is about to be collected.
  const choreographyTotals = resolveSelectedOperationalTotals({
    rows: input.choreographyFinanceRows,
    selectedRowIds: selectedChoreographyIds,
    summary: choreographyThresholds,
  });
  const seminarTotals = resolveSelectedOperationalTotals({
    rows: input.seminarFinanceRows,
    selectedRowIds: selectedSeminarIds,
    summary: seminarThresholds,
  });
  const isSeminarsTab = activeTab === seminarsTabValue;
  // The default tab is the absence of the parameter, not a value for it: the
  // URL only ever names the tab the page does not open on.
  const onTabChange = useCallback(
    (value: string) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);

          if (value === seminarsTabValue) {
            next.set(financeTabParam, seminarsTabValue);
          } else {
            next.delete(financeTabParam);
          }

          return next;
        },
        { preventScrollReset: true, replace: true },
      );
    },
    [setSearchParams],
  );

  return {
    activeTab,
    activeThresholds: isSeminarsTab
      ? seminarThresholds
      : choreographyThresholds,
    activeTotals: isSeminarsTab ? seminarTotals : choreographyTotals,
    choreographyTotals,
    onTabChange,
    seminarTotals,
    selectedChoreographyIds,
    selectedSeminarIds,
    setSelectedChoreographyIds,
    setSelectedSeminarIds,
  };
}
