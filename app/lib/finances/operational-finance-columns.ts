import { type DataTableColumn } from "@/components/shared/data-table";
import { formatOperationalAmount } from "@/lib/finances/formatters";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";

/**
 * The money columns of a row that stands for a whole account or a whole
 * choreography: the administrator's academy list, the administrator's list of an
 * academy's choreographies, and the academy's own list of its choreographies.
 *
 * They are the same three readings on the three screens, and the reason to share
 * them is the decoration rather than the figures. `Total` is muted and
 * `Saldo adeudado` is emphasised so that a glance lands on the actionable
 * number, and a rule like that is only worth anything if it holds everywhere:
 * one list dimming a different column teaches the reader that the grey means
 * something, when it means nothing at all.
 *
 * `inscriptionFinanceColumns` is the same idea one level down, over a single
 * inscription. The two do not share code because they do not share a row —
 * an inscription's figures are `number | null`, where an absent price reads
 * `Sin precio`, while these are already summed and carry their own
 * completeness.
 */
export type OperationalFinanceRow = {
  depositAmount: OperationalFinanceAmount;
  owedBalanceAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
};

export const operationalFinanceColumns: DataTableColumn<OperationalFinanceRow>[] =
  [
    {
      id: "depositAmount",
      header: "Seña",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.depositAmount),
    },
    {
      // Decorative and unconditional: `Total` is the context column — what the
      // debt is measured against — so the whole of it is muted. Never per row: a
      // grey that varies goes back to meaning something.
      id: "totalAmount",
      header: "Total",
      className: "text-right tabular-nums text-muted-foreground",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.totalAmount),
    },
    {
      // The row's only actionable figure, highlighted by column.
      id: "owedBalanceAmount",
      header: "Saldo adeudado",
      className: "text-right font-medium tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.owedBalanceAmount),
    },
  ];
