// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the seminar list under `Finanzas`, one row per academy per seminar.
import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { formatDate } from "@/features/admin/schedules/view-shared";
import type { SeminarAcademyUnitRow } from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import {
  statusColumn,
  unitStatusFacetedFilters,
} from "./finance-unit-columns.prototype";

/**
 * One reading of the removal ticket's note that seminar money views live "under
 * the `Finanzas` menu, as a list": a sidebar sibling of `Academias`, `Pagos` and
 * `Comprobantes` (not added to the real shell here), listing every academy's
 * unit in every seminar with the same figures and badges as the academy list.
 * Each row opens the `(seminar, academy)` financial detail the academy list also
 * reaches; in the prototype every row opens the Estudio Danza Sur one.
 */
export function SeminarFinanceListPrototype({
  buildDetailHref,
  rows,
}: {
  buildDetailHref: () => string;
  rows: SeminarAcademyUnitRow[];
}) {
  const columns: DataTableColumn<SeminarAcademyUnitRow>[] = [
    {
      id: "instructorName",
      header: "Seminario",
      className: "min-w-48 font-medium",
      cell: (row) => (
        <DataTableLink to={buildDetailHref()}>
          {row.instructorName}
        </DataTableLink>
      ),
      filterValue: (row) => `${row.instructorName} ${row.academyName}`,
      sortValue: (row) => `${row.scheduledDate} ${row.instructorName}`,
    },
    {
      id: "scheduledDate",
      header: "Fecha",
      className: "text-muted-foreground",
      cell: (row) => formatDate(row.scheduledDate),
    },
    {
      id: "academyName",
      header: "Academia",
      className: "min-w-48",
      cell: (row) => row.academyName,
      sortValue: (row) => row.academyName,
    },
    {
      id: "inscriptionCount",
      header: "Inscriptos",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => row.inscriptionCount,
    },
    ...operationalFinanceColumns,
    statusColumn<SeminarAcademyUnitRow>(),
  ];

  return (
    <AdminResourceLayout
      selectedEventId="evento-prototipo"
      title="Seminarios"
      description="Saldo de cada academia en cada seminario del evento activo: seña, total y saldo adeudado."
    >
      <ClientDataTable
        rows={rows}
        columns={columns}
        facetedFilters={unitStatusFacetedFilters}
        getRowKey={(row) => `${row.id}-${row.academyId}`}
        searchPlaceholder="Buscar por seminario o academia"
        textFilterColumnId="instructorName"
        initialSort={{ columnId: "instructorName", direction: "asc" }}
        emptyMessage="No hay inscripciones en seminarios para mostrar."
      />
    </AdminResourceLayout>
  );
}
