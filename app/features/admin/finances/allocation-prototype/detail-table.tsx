/**
 * THROWAWAY PROTOTYPE — the inscriptions table of #550's view 2.
 *
 * Built like the choreography detail view already in use
 * (`.../choreography-detail/view.tsx`): `ClientDataTable`, a `Bailarín` column
 * that sorts, then the derived figures right-aligned.
 *
 * **No selection column and no bulk actions.** `Pagar seña` and `Pagar saldo`
 * are list actions on the *choreography list*, which covers the common path;
 * here an allocation is resolved **per inscription**.
 *
 * **No `Acciones` column either**: the dancer's name *is* the action, exactly as
 * `DancerNameCell` already does it in the real view — a `variant="link"` button
 * holding its own `open` state, with the dialog rendered beside it. Note this is
 * a `Button` and not `DataTableLink`: that component wraps a `Link` and is for
 * navigation, and nothing here navigates.
 *
 * The price is a **label**: it is fixed by the first allocation, and picking one
 * belongs to the allocation gesture rather than to a cell.
 *
 * **Tentative figures are muted.** A figure is tentative while the money behind
 * it has not arrived: `Seña` reads as a demand until the threshold is met, and
 * `Saldo adeudado` until the inscription is paid in full. Muting them says which
 * numbers are still moving without adding a column to say it.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DataTableColumn } from "@/components/shared/data-table.shared";

import { formatAmount } from "../formatters";
import {
  inscriptionStatusBadgeVariants,
  inscriptionStatusLabels,
  type InscriptionReading,
} from "./fixtures";
import { ManualAllocateDialog } from "./manual-allocate-dialog";
import { inscriptionAnomalyLabels, readInscriptionAnomalies } from "./rollup";
import { usePrototype } from "./store";
import { TentativeAmount } from "./tentative-amount";

/**
 * A module-level constant rather than a memoised factory: a stable array is what
 * keeps React Table from remounting the cells and dropping each row's `open`
 * state, which is the hazard the real view's `useMemo` exists to avoid. The cell
 * reaches the store itself instead of taking handlers as props.
 */
export const inscriptionColumns: DataTableColumn<InscriptionReading>[] = [
  {
    id: "dancer",
    header: "Bailarín",
    className: "min-w-56 font-medium",
    cell: (row) => <DancerNameCell inscription={row} />,
    filterValue: (row) => row.dancerName,
    sortValue: (row) => row.dancerName,
  },
  {
    id: "priceName",
    header: "Precio",
    cell: (row) => <Badge variant="secondary">{row.priceName}</Badge>,
  },
  {
    id: "depositAmount",
    header: "Seña",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => (
      <TentativeAmount
        amount={row.depositAmount}
        // Tentative until the threshold is met — `Señada` and `Pagada` both
        // clear it.
        isTentative={row.status === "depositPending"}
      />
    ),
  },
  {
    id: "totalAmount",
    header: "Total",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.totalAmount),
  },
  {
    id: "owedBalanceAmount",
    header: "Saldo adeudado",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => (
      <TentativeAmount
        amount={row.owedBalanceAmount}
        // Stays tentative all the way to `Pagada`: a met deposit settles the
        // threshold, not the balance.
        isTentative={row.status !== "paidInFull"}
      />
    ),
  },
  {
    id: "status",
    header: "Estado",
    cell: (row) => <StatusCell inscription={row} />,
    filterValue: (row) => row.status,
  },
];

/**
 * An anomaly **replaces** the status badge rather than sitting beside it. Both
 * compete for the same glance, and «Señada» next to «Sobreasignada» reads as two
 * facts of equal weight when only one of them needs an admin. The status is
 * still a click away in the dialog; the anomaly is the thing to surface here.
 */
function StatusCell({ inscription }: { inscription: InscriptionReading }) {
  const prototype = usePrototype();
  const groupType =
    prototype.choreographies.find(
      (row) => row.id === inscription.choreographyId,
    )?.groupType ?? "";
  const anomalies = readInscriptionAnomalies(groupType, inscription);

  if (anomalies.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {anomalies.map((anomaly) => (
          <Badge key={anomaly} variant="warning">
            {inscriptionAnomalyLabels[anomaly]}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <Badge variant={inscriptionStatusBadgeVariants[inscription.status]}>
      {inscriptionStatusLabels[inscription.status]}
    </Badge>
  );
}

function DancerNameCell({ inscription }: { inscription: InscriptionReading }) {
  const [open, setOpen] = useState(false);
  const prototype = usePrototype();
  const groupType =
    prototype.choreographies.find(
      (row) => row.id === inscription.choreographyId,
    )?.groupType ?? "";

  return (
    <>
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-left font-medium"
        onClick={() => setOpen(true)}
      >
        {inscription.dancerName}
      </Button>
      {open ? (
        <ManualAllocateDialog
          inscription={inscription}
          state={prototype.state}
          choreographyGroupType={groupType}
          availableBalanceAmount={prototype.academy.availableBalanceAmount}
          onClose={() => setOpen(false)}
          onSelectPrice={prototype.onSelectPrice}
          onAllocate={prototype.onAllocate}
        />
      ) : null}
    </>
  );
}
