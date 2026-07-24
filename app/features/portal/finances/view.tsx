import { WalletCards } from "lucide-react";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { MetricCard } from "@/components/shared/metric-card";
import { Badge } from "@/components/ui/badge";
import {
  formatAmount,
  formatOperationalAmount,
} from "@/features/admin/academies/account-current/formatters";
import type { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import {
  choreographyFinancialStateOptions,
  formatChoreographyFinancialState,
  getChoreographyFinancialStateBadgeVariant,
} from "@/lib/finances/choreography-financial-state";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

type PortalAcademyFinancesLoaderData = Awaited<
  ReturnType<typeof loadPortalAcademyFinances>
>;

type ChoreographyFinanceRow =
  PortalAcademyFinancesLoaderData["choreographyFinanceRows"][number];

const choreographyFinanceFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "estado",
    label: "Estado",
    options: [...choreographyFinancialStateOptions],
  },
];

const choreographyFinanceColumns: DataTableColumn<ChoreographyFinanceRow>[] = [
  {
    id: "name",
    header: "Nombre",
    className: "min-w-56 font-medium",
    cell: (row) => (
      <DataTableLink to={`/portal/finanzas/${row.id}`}>
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
      <Badge
        variant={getChoreographyFinancialStateBadgeVariant(row.financialState)}
      >
        {formatChoreographyFinancialState(row.financialState)}
      </Badge>
    ),
    filterValue: (row) => row.financialState,
  },
];

export function PortalAcademyFinancesRouteView({
  loaderData,
}: {
  loaderData: PortalAcademyFinancesLoaderData;
}) {
  if (!loaderData.activeEvent) {
    return (
      <PortalListPage
        titleId="finanzas-title"
        title="Cuenta corriente"
        description="Revisá el estado financiero de las coreografías de tu academia."
      >
        <PortalEmptyState
          title="Todavía no hay un evento activo"
          description="Cuando administración active un evento, vas a poder consultar tu saldo y tus coreografías desde esta sección."
          icon={<WalletCards aria-hidden="true" />}
        />
      </PortalListPage>
    );
  }

  return (
    <PortalListPage
      titleId="finanzas-title"
      title="Cuenta corriente"
      description="Revisá el estado financiero de las coreografías de tu academia."
    >
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Seña adeudada"
          value={formatOperationalAmount(loaderData.summary.owedDepositAmount)}
        />
        <MetricCard
          title="Saldo disponible"
          value={formatAmount(loaderData.summary.availableBalanceAmount)}
        />
        <MetricCard
          title="Saldo adeudado"
          value={formatOperationalAmount(loaderData.summary.owedBalanceAmount)}
        />
      </section>

      <ClientDataTable
        rows={loaderData.choreographyFinanceRows}
        columns={choreographyFinanceColumns}
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
    </PortalListPage>
  );
}
