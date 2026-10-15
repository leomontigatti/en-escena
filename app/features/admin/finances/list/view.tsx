import { Landmark } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import {
  ownerKindFilterValue,
  ownerKindLabel,
  ownerKinds,
} from "@/lib/academies/owner-kind";
import { formatAmount } from "@/lib/finances/formatters";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import { describeEmptyList } from "@/lib/list-query/list-query";

import type { FinanceAccountRow, loadFinancesList } from "./server";

const emptyAcademyList = describeEmptyList("academias", "search");

export const financesListFacetedFilterIds = ["tipo"] as const;

/** Academies and individuals share the list (ADR-0019); `Tipo` splits them. */
const financesListFacetedFilters: DataTableFacetedFiltersOf<
  typeof financesListFacetedFilterIds
> = [
  {
    id: "tipo",
    label: "Tipo",
    options: ownerKinds.map((kind) => ({
      label: ownerKindLabel(kind),
      value: ownerKindFilterValue(kind),
    })),
  },
];

type FinancesListLoaderData = Awaited<ReturnType<typeof loadFinancesList>>;

type FinancesListRouteViewProps = {
  loaderData: FinancesListLoaderData;
};

const accountColumns: DataTableColumn<FinanceAccountRow>[] = [
  {
    id: "academyName",
    header: "Nombre",
    className: "min-w-56 font-medium",
    cell: (row) => (
      <DataTableLink
        recordTitle
        to={`/administracion/finanzas/${row.academyId}`}
      >
        {row.academyName}
      </DataTableLink>
    ),
    filterValue: (row) => row.academyName,
    sortValue: (row) => row.academyName,
  },
  {
    id: "kind",
    header: "Tipo",
    cell: (row) => (
      <Badge variant="secondary">{ownerKindLabel(row.kind)}</Badge>
    ),
    filterValue: (row) => ownerKindFilterValue(row.kind),
  },
  ...operationalFinanceColumns,
  {
    id: "availableBalanceAmount",
    header: "Saldo disponible",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.availableBalanceAmount),
  },
];

export function FinancesListRouteView({
  loaderData,
}: FinancesListRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Finanzas"
      description="Saldo de cada academia y particular en el evento activo: seña, total, saldo adeudado y saldo disponible."
      eventRequiredEmptyState={{
        title: "No hay un evento activo para operar finanzas",
        description:
          "Activá un evento para revisar cuentas corrientes y pagos.",
      }}
    >
      {loaderData.rows.length > 0 ? (
        <ClientDataTable
          rows={loaderData.rows}
          columns={accountColumns}
          facetedFilters={financesListFacetedFilters}
          getRowKey={(row) => row.academyId}
          searchPlaceholder="Buscar por nombre"
          textFilterColumnId="academyName"
          initialSort={{
            columnId: "academyName",
            direction: "asc",
          }}
          emptyMessage={emptyAcademyList.nothingMatched}
        />
      ) : (
        <AdminEmptyState
          icon={Landmark}
          title="Todavía no hay academias con movimientos financieros."
          description="Cuando el evento activo tenga academias con coreografías o movimientos financieros, van a aparecer acá."
        />
      )}
    </AdminResourceLayout>
  );
}
