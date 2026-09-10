// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the choreography, seminar and mixed tables of the academy finances.
import { Info } from "lucide-react";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/features/admin/schedules/view-shared";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { type InscriptionFinancialStatus } from "@/lib/finances/inscription-financial-status";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";
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
 * invoiced (#894). No selection — there is no preset over seminar money (#888).
 */
export function SeminarUnitsTable({
  buildSeminarHref,
  hideControls = false,
  rows,
}: {
  buildSeminarHref: () => string;
  hideControls?: boolean;
  rows: SeminarUnitRow[];
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
      facetedFilters={hideControls ? undefined : unitStatusFacetedFilters}
      getRowKey={(row) => row.id}
      searchPlaceholder="Buscar seminario por instructor"
      textFilterColumnId="instructorName"
      hideSearch={hideControls}
      hidePagination={hideControls}
      initialSort={{ columnId: "scheduledDate", direction: "asc" }}
      emptyMessage="La academia no tiene inscripciones en seminarios."
    />
  );
}

type MixedUnitRow = {
  id: string;
  kind: "choreography" | "seminar";
  label: string;
  detail: string;
  depositAmount: OperationalFinanceAmount;
  owedBalanceAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
  financialStatus: InscriptionFinancialStatus;
};

const mixedFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "tipo",
    label: "Tipo",
    options: [
      { label: "Coreografía", value: "choreography" },
      { label: "Seminario", value: "seminar" },
    ],
  },
  ...unitStatusFacetedFilters,
];

export function MixedUnitsTable({
  buildSeminarHref,
  choreographyRows,
  onSelectedRowIdsChange,
  selectedRowIds,
  selectsSeminar,
  seminarRows,
}: {
  buildSeminarHref: () => string;
  choreographyRows: ChoreographyUnitRow[];
  onSelectedRowIdsChange: (ids: string[]) => void;
  selectedRowIds: string[];
  selectsSeminar: boolean;
  seminarRows: SeminarUnitRow[];
}) {
  const rows: MixedUnitRow[] = [
    ...choreographyRows.map(
      (row): MixedUnitRow => ({
        id: row.id,
        kind: "choreography",
        label: `${formatEventSequenceNumber(row.choreographyNumber)} ${row.name}`,
        detail: formatGroupTypeLabel(
          row.groupType as Parameters<typeof formatGroupTypeLabel>[0],
        ),
        depositAmount: row.depositAmount,
        owedBalanceAmount: row.owedBalanceAmount,
        totalAmount: row.totalAmount,
        financialStatus: row.financialStatus,
      }),
    ),
    ...seminarRows.map(
      (row): MixedUnitRow => ({
        id: row.id,
        kind: "seminar",
        label: `Seminario ${row.instructorName}`,
        detail: formatDate(row.scheduledDate),
        depositAmount: row.depositAmount,
        owedBalanceAmount: row.owedBalanceAmount,
        totalAmount: row.totalAmount,
        financialStatus: row.financialStatus,
      }),
    ),
  ];
  const columns: DataTableColumn<MixedUnitRow>[] = [
    {
      id: "label",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (row) => (
        <DataTableLink
          to={row.kind === "seminar" ? buildSeminarHref() : "#prototipo"}
        >
          {row.label}
        </DataTableLink>
      ),
      filterValue: (row) => row.label,
      sortValue: (row) => `${row.kind === "choreography" ? 0 : 1} ${row.label}`,
    },
    {
      id: "kind",
      header: "Tipo",
      cell: (row) => (
        <Badge variant="secondary">
          {row.kind === "seminar" ? "Seminario" : "Coreografía"}
        </Badge>
      ),
      filterValue: (row) => row.kind,
    },
    {
      id: "detail",
      header: "Detalle",
      className: "text-muted-foreground",
      cell: (row) => row.detail,
    },
    ...operationalFinanceColumns,
    statusColumn<MixedUnitRow>(),
  ];

  return (
    <div className="flex flex-col gap-3">
      {selectsSeminar ? (
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>
            Pagar seña y Pagar saldo solo operan sobre coreografías: quitá los
            seminarios de la selección.
          </AlertDescription>
        </Alert>
      ) : null}
      <ClientDataTable
        rows={rows}
        columns={columns}
        facetedFilters={mixedFacetedFilters}
        getRowKey={(row) => row.id}
        searchPlaceholder="Buscar coreografía o seminario"
        textFilterColumnId="label"
        pageSize={25}
        selectableRows
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={onSelectedRowIdsChange}
        initialSort={{ columnId: "label", direction: "asc" }}
        emptyMessage="No hay coreografías ni seminarios para mostrar."
      />
    </div>
  );
}
