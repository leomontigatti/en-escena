/**
 * PROTOTIPO DESCARTABLE — columnas de la lista financiera (#550).
 *
 * La lista corre sobre `ServerDataTable`, así que buscar, ordenar y paginar
 * viajan por la URL (`q`, `orden`, `page`) y el prototipo los resuelve en memoria
 * en lugar de un loader. La selección es una columna más, porque la tabla del
 * repo no expone API de selección.
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
import { ChoreographyAnomalyBadges } from "./list-shared";
import type { ChoreographyReading } from "./rollup";

export function buildChoreographyColumns({
  selectedIds,
  onToggle,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
}): DataTableColumn<ChoreographyReading>[] {
  return [
    {
      id: "seleccion",
      header: "",
      className: "w-8",
      headerClassName: "w-8",
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
        <div className="flex flex-col gap-1">
          <DataTableLink
            to={`/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=${row.id}`}
          >
            {row.name}
          </DataTableLink>
          <ChoreographyAnomalyBadges anomalies={row.anomalies} />
        </div>
      ),
      filterValue: (row) => row.name,
      sortValue: (row) => row.name,
    },
    {
      id: "groupType",
      header: "Tipo de grupo",
      cell: (row) => <Badge variant="secondary">{row.groupType}</Badge>,
      sortValue: (row) => row.groupType,
    },
    {
      id: "depositAmount",
      header: "Seña",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatAmount(row.depositAmount),
      sortValue: (row) => row.depositAmount,
    },
    {
      id: "totalAmount",
      header: "Total",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) =>
        `${formatAmount(row.totalAmount)}${row.tentative ? " *" : ""}`,
      sortValue: (row) => row.totalAmount,
    },
    {
      id: "owedBalanceAmount",
      header: "Saldo adeudado",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatAmount(row.owedBalanceAmount),
      sortValue: (row) => row.owedBalanceAmount,
    },
    {
      id: "status",
      header: "Estado",
      cell: (row) =>
        row.status === null ? (
          <Badge variant="outline">Tentativa</Badge>
        ) : (
          <Badge variant={inscriptionStatusBadgeVariants[row.status]}>
            {inscriptionStatusLabels[row.status]}
          </Badge>
        ),
      sortValue: (row) => row.status ?? "",
    },
  ];
}
