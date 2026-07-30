/**
 * THROWAWAY PROTOTYPE — the inscriptions table of #550's view 2.
 *
 * Built like the choreography detail view already in use
 * (`.../choreography-detail/view.tsx`): `ClientDataTable`, a `Bailarín` column
 * that sorts and filters, then the derived figures right-aligned.
 *
 * **No selection column and no bulk actions here.** `Pagar seña` and
 * `Pagar saldo` are list actions on the *choreography list*, which is where the
 * common path lives; in this view an allocation is resolved **per inscription**,
 * from the row action. The old per-row `Pagar seña` / `Pagar saldo` instance
 * actions are gone entirely — they were rungs of the retired ladder.
 *
 * The price is a **label**, not a control: it is fixed by the first allocation,
 * so the only row that can still choose one has no money on it, and that choice
 * belongs to the allocation gesture rather than to a cell. Picking therefore
 * lives in `ManualAllocateDialog`, off the row menu.
 *
 * Tentative figures are muted, with no asterisk and no legend — the same
 * treatment the choreography list settled on.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DataTableColumn } from "@/components/shared/data-table.shared";

import { formatAmount } from "../formatters";
import {
  inscriptionStatusBadgeVariants,
  inscriptionStatusLabels,
  type InscriptionReading,
} from "./fixtures";

/** A row with no price chosen: every figure on it can still move. */
const tentativeClassName = (row: InscriptionReading) =>
  row.status === null ? "text-muted-foreground" : undefined;

export function buildInscriptionColumns({
  onAllocateByHand,
}: {
  onAllocateByHand: (inscription: InscriptionReading) => void;
}): DataTableColumn<InscriptionReading>[] {
  return [
    {
      id: "dancer",
      header: "Bailarín",
      className: "min-w-56 font-medium",
      cell: (row) => (
        <div className="flex flex-col">
          {row.dancerName}
          <span className="text-xs font-normal text-muted-foreground">
            {row.priceName ?? "Sin precio elegido"}
          </span>
        </div>
      ),
      filterValue: (row) => row.dancerName,
      sortValue: (row) => row.dancerName,
    },
    {
      id: "status",
      header: "Estado",
      cell: (row) => <StatusCell row={row} />,
      filterValue: (row) => row.status ?? "",
    },
    {
      id: "depositAmount",
      header: "Seña",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cellClassName: tentativeClassName,
      cell: (row) =>
        row.depositAmount === null ? "—" : formatAmount(row.depositAmount),
    },
    {
      id: "totalAmount",
      header: "Total",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cellClassName: tentativeClassName,
      cell: (row) =>
        row.totalAmount === null ? "—" : formatAmount(row.totalAmount),
    },
    {
      id: "allocatedAmount",
      header: "Asignado",
      className: "text-right font-medium tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatAmount(row.allocatedAmount),
    },
    {
      id: "owedBalanceAmount",
      header: "Saldo adeudado",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cellClassName: tentativeClassName,
      cell: (row) =>
        row.owedBalanceAmount === null
          ? "—"
          : formatAmount(row.owedBalanceAmount),
    },
    {
      id: "actions",
      header: "Acciones",
      className: "w-28 text-right",
      headerClassName: "text-right",
      cell: (row) => (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onAllocateByHand(row)}
        >
          Asignar
        </Button>
      ),
    },
  ];
}

/**
 * Only the status. The anomalies used to sit here as badges; they are alerts
 * above the table now, because an over-allocation is a problem to fix rather
 * than a way a row can be.
 */
function StatusCell({ row }: { row: InscriptionReading }) {
  if (row.status === null) {
    return <Badge variant="outline">Sin precio</Badge>;
  }

  return (
    <Badge variant={inscriptionStatusBadgeVariants[row.status]}>
      {inscriptionStatusLabels[row.status]}
    </Badge>
  );
}
