// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the choreography and seminar tables of the academy finances.
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/features/admin/schedules/view-shared";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import {
  type ChoreographyUnitRow,
  type SeminarUnitRow,
} from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";
import {
  unitStatusFacetedFilters,
  statusColumn,
} from "./finance-unit-columns.prototype";

/** The choreography table as it is today (`academy-choreographies/view.tsx`). */
export function ChoreographyUnitsTable({
  onSelectedRowIdsChange,
  rows,
  selectedRowIds,
}: {
  onSelectedRowIdsChange: (ids: string[]) => void;
  rows: ChoreographyUnitRow[];
  selectedRowIds: string[];
}) {
  const columns: DataTableColumn<ChoreographyUnitRow>[] = [
    {
      id: "choreographyNumber",
      header: "#",
      className: "w-16 font-medium tabular-nums",
      headerClassName: "w-16",
      cell: (row) => (
        <DataTableLink to="#prototipo">
          {formatEventSequenceNumber(row.choreographyNumber)}
        </DataTableLink>
      ),
      sortValue: (row) => row.choreographyNumber,
    },
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (row) => row.name,
      filterValue: (row) =>
        `${formatEventSequenceNumber(row.choreographyNumber)} ${row.name}`,
      sortValue: (row) => row.name,
    },
    {
      id: "groupType",
      header: "Tipo de grupo",
      cell: (row) => (
        <Badge variant="secondary">
          {formatGroupTypeLabel(
            row.groupType as Parameters<typeof formatGroupTypeLabel>[0],
          )}
        </Badge>
      ),
    },
    ...operationalFinanceColumns,
    statusColumn<ChoreographyUnitRow>(),
  ];

  return (
    <ClientDataTable
      rows={rows}
      columns={columns}
      facetedFilters={unitStatusFacetedFilters}
      getRowKey={(row) => row.id}
      searchPlaceholder="Buscar coreografía por número o nombre"
      textFilterColumnId="name"
      pageSize={25}
      selectableRows
      selectedRowIds={selectedRowIds}
      onSelectedRowIdsChange={onSelectedRowIdsChange}
      initialSort={{ columnId: "choreographyNumber", direction: "asc" }}
      emptyMessage="No hay coreografías para mostrar."
    />
  );
}

/**
 * One row per seminar the academy holds inscriptions in: the unit that is
 * invoiced (#894). Selectable like the choreography table, so the owed figures
 * can narrow to the selected seminars; no collection acts on the selection,
 * because there is no preset over seminar money (#888).
 */
export function SeminarUnitsTable({
  buildSeminarHref,
  onSelectedRowIdsChange,
  rows,
  selectedRowIds,
}: {
  buildSeminarHref: () => string;
  onSelectedRowIdsChange: (ids: string[]) => void;
  rows: SeminarUnitRow[];
  selectedRowIds: string[];
}) {
  const columns: DataTableColumn<SeminarUnitRow>[] = [
    {
      id: "instructorName",
      header: "Seminario",
      className: "min-w-56 font-medium",
      cell: (row) => (
        <DataTableLink to={buildSeminarHref()}>
          {row.instructorName}
        </DataTableLink>
      ),
      filterValue: (row) => row.instructorName,
      sortValue: (row) => row.instructorName,
    },
    {
      id: "scheduledDate",
      header: "Fecha",
      className: "text-muted-foreground",
      cell: (row) => formatDate(row.scheduledDate),
      sortValue: (row) => row.scheduledDate,
    },
    {
      id: "inscriptionCount",
      header: "Inscriptos",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => row.inscriptionCount,
    },
    ...operationalFinanceColumns,
    statusColumn<SeminarUnitRow>(),
  ];

  return (
    <ClientDataTable
      rows={rows}
      columns={columns}
      facetedFilters={unitStatusFacetedFilters}
      getRowKey={(row) => row.id}
      searchPlaceholder="Buscar seminario por instructor"
      textFilterColumnId="instructorName"
      pageSize={25}
      selectableRows
      selectedRowIds={selectedRowIds}
      onSelectedRowIdsChange={onSelectedRowIdsChange}
      initialSort={{ columnId: "scheduledDate", direction: "asc" }}
      emptyMessage="La academia no tiene inscripciones en seminarios."
    />
  );
}
