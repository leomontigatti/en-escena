/**
 * THROWAWAY PROTOTYPE — the inscriptions table of #550's view 2.
 *
 * Built like the choreography detail view already in use
 * (`.../choreography-detail/view.tsx`): `ClientDataTable`, a `Bailarín` column
 * that sorts, then the derived figures right-aligned.
 *
 * **No selection column and no bulk actions.** `Pagar seña` and `Pagar saldo`
 * are list actions on the *choreography list*, which covers the common path;
 * here an allocation is resolved **per inscription**. The old per-row instance
 * actions of the same name are gone — they were rungs of the retired ladder.
 *
 * **No `Acciones` column either**: the dancer's name *is* the action. It is a
 * `DataTableLink` pointing at `?asignar=<id>`, so the allocate dialog is opened
 * by the URL rather than by row state — which means it survives a reload and can
 * be linked to, and the table keeps one column fewer.
 *
 * The price is a **label**: it is fixed by the first allocation, and picking one
 * belongs to the allocation gesture rather than to a cell.
 */
import { useSearchParams } from "react-router";

import { Badge } from "@/components/ui/badge";
import { DataTableLink } from "@/components/shared/data-table-link";
import type { DataTableColumn } from "@/components/shared/data-table.shared";

import { formatAmount } from "../formatters";
import {
  inscriptionStatusBadgeVariants,
  inscriptionStatusLabels,
  type InscriptionReading,
} from "./fixtures";

/**
 * The link has to *merge* into the current query string, not replace it: a bare
 * `to="?asignar=x"` drops `?coreografia=`, which would bounce the admin back to
 * the first choreography on every click.
 */
function AllocateLink({ inscription }: { inscription: InscriptionReading }) {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  next.set("asignar", inscription.id);

  return (
    <DataTableLink to={`?${next.toString()}`} preventScrollReset replace>
      {inscription.dancerName}
    </DataTableLink>
  );
}

export const inscriptionColumns: DataTableColumn<InscriptionReading>[] = [
  {
    id: "dancer",
    header: "Bailarín",
    className: "min-w-56 font-medium",
    cell: (row) => <AllocateLink inscription={row} />,
    filterValue: (row) => row.dancerName,
    sortValue: (row) => row.dancerName,
  },
  {
    id: "priceName",
    header: "Precio",
    cell: (row) => row.priceName,
  },
  {
    id: "depositAmount",
    header: "Seña",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.depositAmount),
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
    cell: (row) => formatAmount(row.owedBalanceAmount),
  },
  {
    id: "status",
    header: "Estado",
    cell: (row) => (
      <Badge variant={inscriptionStatusBadgeVariants[row.status]}>
        {inscriptionStatusLabels[row.status]}
      </Badge>
    ),
    filterValue: (row) => row.status,
  },
];
