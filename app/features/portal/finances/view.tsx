import { WalletCards } from "lucide-react";
import { useState } from "react";

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
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import {
  formatInscriptionFinancialStatus,
  getInscriptionFinancialStatusBadgeVariant,
  inscriptionFinancialStatusOptions,
} from "@/lib/finances/choreography-financial-status";
import { sumOperationalFinanceAmounts } from "@/lib/finances/operational-summary";
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
    id: "choreographyNumber",
    header: "#",
    className: "w-16 font-medium tabular-nums",
    headerClassName: "w-16",
    // The academy sees the same number the administrator does, in the same
    // place and doing the same thing: it opens the row and it is the only link
    // to the detail.
    cell: (row) => (
      <DataTableLink to={`/portal/finanzas/${row.id}`}>
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
    // The search box filters this one column, so the number travels in here to
    // be searchable at all. Zero-padded, which is what makes `00042`, `042` and
    // `42` all reach the same choreography.
    filterValue: (row) =>
      `${formatEventSequenceNumber(row.choreographyNumber)} ${row.name}`,
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
    // Decorative and unconditional: `Total` is the context column — what the debt
    // is measured against — so the whole of it is muted, and never per row.
    id: "totalAmount",
    header: "Total",
    className: "text-right tabular-nums text-muted-foreground",
    headerClassName: "text-right",
    cell: (row) => formatOperationalAmount(row.totalAmount),
  },
  {
    // The row's only actionable figure, highlighted by column.
    id: "owedBalanceAmount",
    header: "Saldo adeudado",
    className: "text-right font-medium tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatOperationalAmount(row.owedBalanceAmount),
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
  // The selection is lifted out of the table because it drives more than the
  // table: the two owed metrics re-scope to it. The academy selects to read,
  // not to act — the collections are the administrator's.
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const selectedRows = loaderData.choreographyFinanceRows.filter((row) =>
    selectedRowIds.includes(row.id),
  );
  const hasSelection = selectedRows.length > 0;
  // The two owed figures are narrowed to the selection; the thresholds and the
  // available balance are not. `Seña adeudada` and `Saldo adeudado` are what the
  // debt is measured by, and selecting a few choreographies is how the academy
  // asks how much *those* owe without adding them up from memory.
  const owedDepositAmount = hasSelection
    ? sumOperationalFinanceAmounts(
        selectedRows.map((row) => row.owedDepositAmount),
      )
    : loaderData.summary.owedDepositAmount;
  const owedBalanceAmount = hasSelection
    ? sumOperationalFinanceAmounts(
        selectedRows.map((row) => row.owedBalanceAmount),
      )
    : loaderData.summary.owedBalanceAmount;

  if (!loaderData.activeEvent) {
    return (
      <PortalListPage
        titleId="finanzas-title"
        title="Resumen financiero"
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
      title="Resumen financiero"
      description="Revisá el estado financiero de las coreografías de tu academia."
    >
      {/* Each threshold with its owed figure beside it —`Seña total` with
          `Seña adeudada`, `Total` with `Saldo adeudado`— and the available
          balance at the end, which belongs to neither pair: it is the academy's
          unallocated money. */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          title="Seña total"
          value={formatOperationalAmount(loaderData.summary.depositAmount)}
        />
        <MetricCard
          title="Seña adeudada"
          value={formatOperationalAmount(owedDepositAmount)}
        />
        <MetricCard
          title="Total"
          value={formatOperationalAmount(loaderData.summary.totalAmount)}
        />
        <MetricCard
          title="Saldo adeudado"
          value={formatOperationalAmount(owedBalanceAmount)}
        />
        <MetricCard
          title="Saldo disponible"
          value={formatAmount(loaderData.summary.availableBalanceAmount)}
        />
      </section>

      <ClientDataTable
        rows={loaderData.choreographyFinanceRows}
        columns={choreographyFinanceColumns}
        facetedFilters={choreographyFinanceFacetedFilters}
        getRowKey={(row) => row.id}
        searchPlaceholder="Buscar coreografía por número o nombre"
        textFilterColumnId="name"
        selectableRows
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={setSelectedRowIds}
        // By number, like every other choreography list: it is the row's
        // identity within the event.
        initialSort={{
          columnId: "choreographyNumber",
          direction: "asc",
        }}
        emptyMessage="No hay coreografías para mostrar."
      />
    </PortalListPage>
  );
}
