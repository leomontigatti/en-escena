/**
 * THROWAWAY PROTOTYPE — the financial list's columns (#550).
 *
 * The list runs on `ClientDataTable`, which owns search, sort, filtering,
 * pagination and the selection column: the prototype's data is a fixture held in
 * memory, so there is no loader for a server table to talk to. Only `Nombre`
 * sorts — the rest of the columns are derived figures, and sorting by them is not
 * a reading an admin asks for.
 */
import { Badge } from "@/components/ui/badge";
import { DataTableLink } from "@/components/shared/data-table-link";
import type { DataTableColumn } from "@/components/shared/data-table.shared";

import { formatAmount } from "../formatters";
import {
  inscriptionStatusBadgeVariants,
  inscriptionStatusLabels,
} from "./fixtures";
import { choreographyAnomalyLabels, type ChoreographyReading } from "./rollup";
import { TentativeAmount } from "./tentative-amount";

export const choreographyColumns: DataTableColumn<ChoreographyReading>[] = [
  {
    id: "name",
    header: "Nombre",
    className: "min-w-56 font-medium",
    cell: (row) => (
      <DataTableLink
        to={`/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=${row.id}`}
      >
        {row.name}
      </DataTableLink>
    ),
    filterValue: (row) => row.name,
    sortValue: (row) => row.name,
  },
  {
    id: "groupType",
    header: "Tipo de grupo",
    cell: (row) => <Badge variant="secondary">{row.groupType}</Badge>,
    filterValue: (row) => row.groupType,
  },
  {
    id: "depositAmount",
    header: "Seña",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => (
      <TentativeAmount
        amount={row.depositAmount}
        // The status is the **minimum** across the roster (#551), so this greys
        // while *any* inscription is short of its deposit — the choreography's
        // seña is not in until the last dancer's is.
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
        // Like the inscriptions table: settled only at `Pagada`. A choreography
        // with no roster at all has nothing tentative about its zero.
        isTentative={row.status !== null && row.status !== "paidInFull"}
      />
    ),
  },
  {
    id: "status",
    header: "Estado",
    cell: (row) => <StatusCell row={row} />,
    filterValue: (row) => row.status ?? "",
  },
];

/**
 * Status and anomalies live together: both answer "how is this choreography
 * doing", and #551 wants them self-clearing, with nothing to acknowledge.
 *
 * They stay **badges** here, where the detail view raises them as alerts: a
 * table row cannot hold an alert, and on the list the anomaly is a compact
 * signal that sends you into the detail, which is where the fix happens.
 *
 * **An anomaly replaces the status**, it does not precede it. A choreography
 * that needs attention has to say so instead of saying how its money is doing:
 * side by side the two read as facts of equal weight, and only one of them is
 * asking for an admin. The status returns on its own once the anomaly clears.
 */
function StatusCell({ row }: { row: ChoreographyReading }) {
  if (row.anomalies.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {row.anomalies.map((anomaly) => (
          <Badge key={anomaly} variant="warning">
            {choreographyAnomalyLabels[anomaly]}
          </Badge>
        ))}
      </div>
    );
  }

  if (row.status === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <Badge variant={inscriptionStatusBadgeVariants[row.status]}>
      {inscriptionStatusLabels[row.status]}
    </Badge>
  );
}
