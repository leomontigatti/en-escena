import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { MetricCard } from "@/components/shared/metric-card";
import { Badge } from "@/components/ui/badge";
import {
  formatInscriptionFinancialStatus,
  getInscriptionFinancialStatusBadgeVariant,
  inscriptionFinancialStatusOptions,
} from "@/lib/finances/choreography-financial-status";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import { formatAmount, formatOperationalAmount } from "../formatters";
import type { AcademyFinancesLoaderData } from "./types";

type ChoreographyFinanceRow =
  AcademyFinancesLoaderData["choreographyFinanceRows"][number];

const choreographyFinanceFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "estado",
    label: "Estado",
    options: [...inscriptionFinancialStatusOptions],
  },
];

type AcademyFinancesRouteViewProps = {
  loaderData: AcademyFinancesLoaderData;
};

export function AcademyFinancesRouteView({
  loaderData,
}: AcademyFinancesRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={loaderData.academy.name}
      description="Lista financiera de las coreografías de esta academia."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar las finanzas",
        description:
          "Activá un evento para consultar la lista financiera de las coreografías de la academia.",
      }}
    >
      <div className="flex flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="Seña adeudada"
            value={formatOperationalAmount(
              loaderData.summary.owedDepositAmount,
            )}
          />
          <MetricCard
            title="Saldo disponible"
            value={formatAmount(loaderData.summary.availableBalanceAmount)}
          />
          <MetricCard
            title="Saldo adeudado"
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
      id: "totalAmount",
      header: "Total",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.totalAmount),
    },
    {
      id: "owedBalanceAmount",
      header: "Saldo adeudado",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.owedBalanceAmount),
    },
    {
      id: "financialStatus",
      header: "Estado",
      cell: (row) => (
        <Badge
          variant={getInscriptionFinancialStatusBadgeVariant(
            row.financialStatus,
          )}
        >
          {formatInscriptionFinancialStatus(row.financialStatus)}
        </Badge>
      ),
      filterValue: (row) => row.financialStatus,
    },
  ];
}
