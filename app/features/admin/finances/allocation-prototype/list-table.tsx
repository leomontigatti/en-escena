/**
 * THROWAWAY PROTOTYPE — the financial list's columns (#550).
 *
 * The list runs on `ClientDataTable`, which owns search, sort, filtering,
 * pagination and the selection column: the prototype's data is a fixture held in
 * memory, so there is no loader for a server table to talk to. Only `Nombre`
 * sorts — the rest of the columns are derived figures, and sorting by them is not
 * a reading an admin asks for.
 *
 * A **tentative** figure — the choreography has inscriptions with no price
 * chosen, so the number can still move — is marked by muting the text, with no
 * legend and no asterisk.
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

const tentativeClassName = (row: ChoreographyReading) =>
  row.tentative ? "text-muted-foreground" : undefined;

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
    cellClassName: tentativeClassName,
    cell: (row) => formatAmount(row.depositAmount),
  },
  {
    id: "totalAmount",
    header: "Total",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cellClassName: tentativeClassName,
    cell: (row) => formatAmount(row.totalAmount),
  },
  {
    id: "owedBalanceAmount",
    header: "Saldo adeudado",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cellClassName: tentativeClassName,
    cell: (row) => formatAmount(row.owedBalanceAmount),
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
 * A tentative rollup drops to the neutral `outline` variant rather than keeping
 * its semantic colour: the status is not yet affirmable, and the style guide
 * wants that said with a variant instead of an overridden colour.
 */
function StatusCell({ row }: { row: ChoreographyReading }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {row.status === null ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : (
        <Badge
          variant={
            row.tentative
              ? "outline"
              : inscriptionStatusBadgeVariants[row.status]
          }
        >
          {inscriptionStatusLabels[row.status]}
        </Badge>
      )}
      {row.anomalies.map((anomaly) => (
        <Badge key={anomaly} variant="warning">
          {choreographyAnomalyLabels[anomaly]}
        </Badge>
      ))}
    </div>
  );
}
