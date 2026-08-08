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
} from "@/features/admin/finances/formatters";
import type { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import {
  formatInscriptionFinancialStatus,
  getInscriptionFinancialStatusBadgeVariant,
  inscriptionFinancialStatusOptions,
} from "@/lib/finances/choreography-financial-status";
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
    options: [...inscriptionFinancialStatusOptions],
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
    // Decorativo y sin condición: `Total` es la columna de contexto —contra qué se
    // mide lo adeudado—, así que va atenuada entera y nunca por fila.
    id: "totalAmount",
    header: "Total",
    className: "text-right tabular-nums text-muted-foreground",
    headerClassName: "text-right",
    cell: (row) => formatOperationalAmount(row.totalAmount),
    sortValue: (row) => row.totalAmount.amount,
  },
  {
    // La única cifra accionable de la fila, destacada por columna.
    id: "owedBalanceAmount",
    header: "Saldo adeudado",
    className: "text-right font-medium tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatOperationalAmount(row.owedBalanceAmount),
    sortValue: (row) => row.owedBalanceAmount.amount,
  },
  {
    id: "financialStatus",
    header: "Estado",
    cell: (row) => (
      <Badge
        variant={getInscriptionFinancialStatusBadgeVariant(row.financialStatus)}
      >
        {formatInscriptionFinancialStatus(row.financialStatus)}
      </Badge>
    ),
    filterValue: (row) => row.financialStatus,
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
