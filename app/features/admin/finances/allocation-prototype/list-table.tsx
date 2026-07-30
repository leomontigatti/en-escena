/**
 * THROWAWAY PROTOTYPE — the financial list's columns (#550).
 *
 * The list runs on `ServerDataTable`, so search, sort and filter travel through
 * the URL (`q`, `orden`, `tipo`, `estado`) and the prototype resolves them in
 * memory instead of in a loader. Only `Nombre` sorts: the rest of the columns are
 * derived figures, and sorting by them is not a reading an admin asks for.
 *
 * A **tentative** figure — the choreography has inscriptions with no price
 * chosen, so the number can still move — is marked by muting the text, with no
 * legend and no asterisk.
 */
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

export function buildChoreographyColumns({
  selectedIds,
  onToggle,
  onToggleAll,
  allSelected,
  someSelected,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  allSelected: boolean;
  someSelected: boolean;
}): DataTableColumn<ChoreographyReading>[] {
  return [
    {
      id: "seleccion",
      header: "Seleccionar",
      headerCell: (
        <Checkbox
          aria-label="Seleccionar todas las filas"
          checked={allSelected || (someSelected ? "indeterminate" : false)}
          onCheckedChange={(checked) => onToggleAll(checked === true)}
        />
      ),
      className: "w-10",
      headerClassName: "w-10",
      cell: (row) => (
        <Checkbox
          aria-label={`Seleccionar ${row.name}`}
          checked={selectedIds.includes(row.id)}
          onCheckedChange={() => onToggle(row.id)}
        />
      ),
    },
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
    },
  ];
}

/**
 * Status and anomalies live together: both answer "how is this choreography
 * doing", and #551 wants them self-clearing, with nothing to acknowledge.
 */
function StatusCell({ row }: { row: ChoreographyReading }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {row.status === null ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : (
        <Badge
          variant={inscriptionStatusBadgeVariants[row.status]}
          className={row.tentative ? "text-muted-foreground" : undefined}
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
