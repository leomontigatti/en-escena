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
 * **Nothing is muted for being tentative any more** (#618). Every figure shown
 * is exact and is exactly what must be paid, so the old per-row grey is gone.
 * What replaces it is a **decorative, unconditional column style**: `Total`
 * muted because it is context, `Saldo adeudado` in `font-medium` because it is
 * the actionable number. It lives in the column definition and never varies per
 * row — a grey that varies means something again.
 *
 * **`Total` carries the arithmetic behind it** (#585): the discount is derived
 * from inscriptions in other choreographies, so the net amount is the one figure
 * on the row that cannot be checked by reading the row. The icon opens the
 * subtraction; the provenance is the section below.
 */
import { Info } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
    cell: (row) => formatAmount(row.depositAmount),
  },
  {
    // Context — what the inscription costs, not what is owed. Muted for the
    // whole column, unconditionally (#618): the actionable number is `Saldo
    // adeudado`, and the total is what it is measured against.
    id: "totalAmount",
    header: "Total",
    className: "text-right tabular-nums text-muted-foreground",
    headerClassName: "text-right",
    cell: (row) => <TotalCell inscription={row} />,
  },
  {
    id: "owedBalanceAmount",
    header: "Saldo adeudado",
    className: "text-right font-medium tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.owedBalanceAmount),
  },
  {
    id: "status",
    header: "Estado",
    cell: (row) => <StatusCell inscription={row} />,
    filterValue: (row) => row.status,
  },
];

/**
 * The subtraction that produced the net amount, on hover. It is deliberately
 * only the **arithmetic** — base price, percentage, discount, total — and not
 * the provenance: which inscriptions earned the percentage is a list of other
 * choreographies, which is too much for a tooltip and is what the `Descuentos`
 * section below the roster is for. Now that the tooltip carries `Precio base`,
 * the column that used to show it is gone: it said the same thing on every row,
 * including the rows where it equalled the total.
 *
 * **The whole cell is the trigger, and it is not a button.** Nothing happens on
 * click — there is no action here, only an explanation — so a button would
 * promise one, and the pointer does not change either. The icon sits to the
 * **left** of the amount so the figures stay flush right and the column still
 * reads as a column of numbers.
 *
 * With no discount there is nothing to explain, so nothing appears: an
 * affordance on every row would be noise on the rows that do not need it.
 */
function TotalCell({ inscription }: { inscription: InscriptionReading }) {
  const amount = formatAmount(inscription.totalAmount);

  if (inscription.discountAmount === 0) {
    return amount;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/*
            `tabIndex` rather than a button: focusable so the explanation is
            reachable without a pointer — which is also the only way to reach it
            on touch — while staying a plain piece of text.
          */}
          <span
            tabIndex={0}
            aria-label={`Cómo se compone el total de ${inscription.dancerName}`}
            className="inline-flex items-center justify-end gap-1"
          >
            <Info
              aria-hidden="true"
              data-icon
              className="size-3.5 text-muted-foreground"
            />
            {amount}
          </span>
        </TooltipTrigger>
        <TooltipContent className="flex flex-col gap-0.5 tabular-nums">
          <span>Precio base {formatAmount(inscription.priceAmount)}</span>
          <span>
            Descuento {inscription.provenance.percentage} %{" "}
            {`−${formatAmount(inscription.discountAmount)}`}
          </span>
          <span className="font-medium">Total {amount}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * An anomaly **replaces** the status badge rather than sitting beside it. Both
 * compete for the same glance, and «Señada» next to «Sobreasignada» reads as two
 * facts of equal weight when only one of them needs an admin. The status is
 * still a click away in the dialog; the anomaly is the thing to surface here.
 */
function StatusCell({ inscription }: { inscription: InscriptionReading }) {
  const anomalies = readInscriptionAnomalies(inscription);

  // The anomaly outranks the withdrawal. A retired row that still holds money is
  // **not resolved**: `Sobreasignada` says somebody has to move that money,
  // `Retirada` says the matter is closed, and showing the closing word over an
  // open problem is how the problem gets missed.
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

  // #600: `Retirada` is a separate derived axis, not a fourth status, and it
  // **replaces** the badge — the row is out of every figure, so «Señada» would
  // describe a demand that no longer exists. It appears only once there is
  // nothing left to resolve: the money is gone and what keeps the row on screen
  // is the invoice line. With neither, the row is not here at all.
  if (inscription.withdrawnAt !== null) {
    return <Badge variant="secondary">Retirada</Badge>;
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
