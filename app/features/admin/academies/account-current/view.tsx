import { CircleDollarSign, Landmark, Receipt } from "lucide-react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { MetricCard } from "@/components/shared/metric-card";
import { Badge } from "@/components/ui/badge";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import {
  formatAmount,
  formatChoreographyFinancialState,
  formatOperationalAmount,
} from "./formatters";
import type { AccountCurrentLoaderData } from "./types";

type ChoreographyFinanceRow =
  AccountCurrentLoaderData["choreographyFinanceRows"][number];

const choreographyFinanceFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "estado",
    label: "Estado",
    options: [
      { label: "Impaga", value: "impaga" },
      { label: "Señada", value: "señada" },
      { label: "Pagada", value: "pagada" },
    ],
  },
];

type AdministracionAcademiaCuentaCorrienteRouteViewProps = {
  loaderData: AccountCurrentLoaderData;
  selectableChoreographyRows?: boolean;
};

export function AdministracionAcademiaCuentaCorrienteRouteView({
  loaderData,
  selectableChoreographyRows = true,
}: AdministracionAcademiaCuentaCorrienteRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Cuenta corriente"
      description="Revisá el estado financiero de las coreografías de una academia."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar la cuenta corriente",
        description:
          "Activá un evento para consultar la cuenta corriente de la academia.",
      }}
    >
      <div className="flex flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="Seña adeudada"
            icon={Receipt}
            value={formatOperationalAmount(
              loaderData.summary.owedDepositAmount,
            )}
          />
          <MetricCard
            title="Saldo disponible"
            icon={CircleDollarSign}
            value={formatAmount(loaderData.summary.availableBalanceAmount)}
          />
          <MetricCard
            title="Saldo adeudado"
            icon={Landmark}
            value={formatOperationalAmount(
              loaderData.summary.owedBalanceAmount,
            )}
          />
        </section>

        <ClientDataTable
          rows={loaderData.choreographyFinanceRows}
          columns={buildChoreographyFinanceColumns(loaderData.academy.id)}
          facetedFilters={choreographyFinanceFacetedFilters}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar coreografía por nombre"
          selectableRows={selectableChoreographyRows}
          textFilterColumnId="name"
          initialSort={{
            columnId: "name",
            direction: "asc",
          }}
          emptyMessage="No hay coreografías para mostrar."
        />
      </div>
    </AdminResourceLayout>
  );
}

function buildChoreographyFinanceColumns(
  academyId: string,
): DataTableColumn<ChoreographyFinanceRow>[] {
  return [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (row) => (
        <DataTableLink
          to={`/administracion/finanzas/${academyId}/coreografias/${row.id}`}
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
      cell: (row) => (
        <Badge variant="secondary">{formatGroupTypeLabel(row.groupType)}</Badge>
      ),
    },
    {
      id: "depositAmount",
      header: "Seña",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.depositAmount),
    },
    {
      id: "balanceAmount",
      header: "Saldo",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.balanceAmount),
      sortValue: (row) => row.balanceAmount.amount,
    },
    {
      id: "financialState",
      header: "Estado",
      cell: (row) => (
        <Badge variant={getFinancialStateBadgeVariant(row.financialState)}>
          {formatChoreographyFinancialState(row.financialState)}
        </Badge>
      ),
      filterValue: (row) => row.financialState,
    },
  ];
}

function getFinancialStateBadgeVariant(
  status: ChoreographyFinanceRow["financialState"],
) {
  switch (status) {
    case "impaga":
      return "warning";
    case "señada":
      return "info";
    case "pagada":
      return "success";
  }
}
