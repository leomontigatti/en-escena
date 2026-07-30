/**
 * PROTOTIPO DESCARTABLE — columnas de la lista financiera (#550).
 *
 * La lista corre sobre `ServerDataTable`, así que buscar, ordenar y filtrar
 * viajan por la URL (`q`, `orden`, `tipo`, `estado`) y el prototipo los resuelve
 * en memoria en lugar de un loader. Sólo `Nombre` ordena: el resto de las
 * columnas son figuras derivadas y ordenar por ellas no es una lectura que el
 * admin pida.
 *
 * Una figura **tentativa** —la coreografía tiene inscripciones sin precio
 * elegido, así que el número todavía puede moverse— se marca atenuando el texto,
 * sin leyenda ni asterisco.
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
 * El estado y las anomalías viven juntos: las dos cosas responden «cómo está
 * esta coreografía», y #551 las quiere autolimpiantes, sin nada que reconocer.
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
