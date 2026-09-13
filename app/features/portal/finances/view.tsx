import { WalletCards } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/features/admin/schedules/view-shared";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import type { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import {
  choreographyStatusFilterOptions,
  formatInscriptionFinancialStatus,
  formatInscriptionStatusBadge,
  getInscriptionFinancialStatusBadgeVariant,
  inscriptionFinancialStatusOptions,
} from "@/lib/finances/choreography-financial-status";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import {
  resolveSelectedOperationalTotals,
  sumOperationalFinanceRows,
} from "@/lib/finances/selected-operational-totals";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

type PortalAcademyFinancesLoaderData = Awaited<
  ReturnType<typeof loadPortalAcademyFinances>
>;

type ChoreographyFinanceRow =
  PortalAcademyFinancesLoaderData["choreographyFinanceRows"][number];

type SeminarFinanceRow =
  PortalAcademyFinancesLoaderData["seminarFinanceRows"][number];

/** The tab the page opens on, and the one the URL does not have to name. */
const choreographiesTabValue = "coreografias";
const seminarsTabValue = "seminarios";
const financeTabParam = "seccion";

export const portalFinanceFacetedFilterIds = ["estado"] as const;

/** One sentence for both tabs: the page is the academy's whole debt. */
const portalFinancesDescription =
  "Revisá el estado financiero de las coreografías y los seminarios de tu academia.";

const seminarFinanceFacetedFilters: DataTableFacetedFiltersOf<
  typeof portalFinanceFacetedFilterIds
> = [
  {
    id: "estado",
    label: "Estado",
    options: [...choreographyStatusFilterOptions],
  },
];

const choreographyFinanceFacetedFilters: DataTableFacetedFiltersOf<
  typeof portalFinanceFacetedFilterIds
> = [
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
  ...operationalFinanceColumns,
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

/**
 * The `Seminarios` tab's rows: one `(seminar, academy)` unit each, the same
 * shape the administrator reads. The instructor is the **only** link — a
 * seminar is named by who teaches it — and `Inscriptos` is the academy's own
 * active count rather than the seminar's occupancy: a place is taken by
 * covering the deposit, not by registering.
 */
const seminarFinanceColumns: DataTableColumn<SeminarFinanceRow>[] = [
  {
    id: "instructorName",
    header: "Seminario",
    className: "min-w-56 font-medium",
    cell: (row) => (
      <DataTableLink to={`/portal/finanzas/seminarios/${row.id}`}>
        {row.instructorName}
      </DataTableLink>
    ),
    filterValue: (row) => row.instructorName,
    sortValue: (row) => row.instructorName,
  },
  {
    id: "scheduledDate",
    header: "Fecha",
    cell: (row) => formatDate(row.scheduledDate),
    sortValue: (row) => row.scheduledDate,
  },
  {
    id: "registrationCount",
    header: "Inscriptos",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => row.registrationCount,
    sortValue: (row) => row.registrationCount,
  },
  ...operationalFinanceColumns,
  {
    id: "financialStatus",
    header: "Estado",
    cell: (row) => {
      const badge = formatSeminarStatusBadge(row);

      return <Badge variant={badge.variant}>{badge.label}</Badge>;
    },
    // The filter comes from the same badge the cell shows, so a row can never
    // turn up under an option it does not display.
    filterValue: (row) => formatSeminarStatusBadge(row).value,
  },
];

function formatSeminarStatusBadge(row: SeminarFinanceRow) {
  return formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({
      anomalies: row.anomalies,
      financialStatus: row.financialStatus,
    }),
  );
}

export function PortalAcademyFinancesRouteView({
  loaderData,
}: {
  loaderData: PortalAcademyFinancesLoaderData;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab =
    searchParams.get(financeTabParam) === seminarsTabValue
      ? seminarsTabValue
      : choreographiesTabValue;
  // **One selection per tab, kept side by side**, exactly as on the panel's
  // academy page: one state narrowed by the active tab would silently drop what
  // was selected on the other one when the academy comes back to it.
  //
  // The academy selects to read and not to act — the collections are the
  // administrator's — but reading how much *those* rows owe is the whole point.
  const [selectedChoreographyIds, setSelectedChoreographyIds] = useState<
    string[]
  >([]);
  const [selectedSeminarIds, setSelectedSeminarIds] = useState<string[]>([]);
  // The four threshold-and-owed figures follow the active tab: they are that
  // kind's debt, summed over that kind's rows. `Saldo disponible` never moves —
  // it is the academy's pool, one for both kinds.
  const choreographyThresholds = sumOperationalFinanceRows(
    loaderData.choreographyFinanceRows,
  );
  const seminarThresholds = sumOperationalFinanceRows(
    loaderData.seminarFinanceRows,
  );
  const choreographyTotals = resolveSelectedOperationalTotals({
    rows: loaderData.choreographyFinanceRows,
    selectedRowIds: selectedChoreographyIds,
    summary: choreographyThresholds,
  });
  const seminarTotals = resolveSelectedOperationalTotals({
    rows: loaderData.seminarFinanceRows,
    selectedRowIds: selectedSeminarIds,
    summary: seminarThresholds,
  });
  const isSeminarsTab = activeTab === seminarsTabValue;
  const activeTotals = isSeminarsTab ? seminarTotals : choreographyTotals;
  const activeThresholds = isSeminarsTab
    ? seminarThresholds
    : choreographyThresholds;

  if (!loaderData.activeEvent) {
    return (
      <PortalListPage
        titleId="finanzas-title"
        title="Resumen financiero"
        description={portalFinancesDescription}
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
      description={portalFinancesDescription}
    >
      {/* The two owed figures re-scope to the active tab's selection, the two
          thresholds follow the tab, and the available balance does neither. */}
      <OperationalFinanceMetrics
        availableBalanceAmount={loaderData.summary.availableBalanceAmount}
        depositAmount={activeThresholds.depositAmount}
        owedBalanceAmount={activeTotals.owedBalanceAmount}
        owedDepositAmount={activeTotals.owedDepositAmount}
        totalAmount={activeThresholds.totalAmount}
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setSearchParams(
            (current) => {
              const next = new URLSearchParams(current);

              if (value === seminarsTabValue) {
                next.set(financeTabParam, seminarsTabValue);
              } else {
                next.delete(financeTabParam);
              }

              return next;
            },
            { preventScrollReset: true, replace: true },
          );
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value={choreographiesTabValue}>Coreografías</TabsTrigger>
          <TabsTrigger value={seminarsTabValue}>Seminarios</TabsTrigger>
        </TabsList>
        <TabsContent value={choreographiesTabValue} className="pt-2">
          <ClientDataTable
            rows={loaderData.choreographyFinanceRows}
            columns={choreographyFinanceColumns}
            facetedFilters={choreographyFinanceFacetedFilters}
            getRowKey={(row) => row.id}
            searchPlaceholder="Buscar coreografía por número o nombre"
            textFilterColumnId="name"
            selectableRows
            selectedRowIds={selectedChoreographyIds}
            onSelectedRowIdsChange={setSelectedChoreographyIds}
            // By number, like every other choreography list: it is the row's
            // identity within the event.
            initialSort={{
              columnId: "choreographyNumber",
              direction: "asc",
            }}
            emptyMessage="No hay coreografías para mostrar."
          />
        </TabsContent>
        <TabsContent value={seminarsTabValue} className="pt-2">
          <ClientDataTable
            rows={loaderData.seminarFinanceRows}
            columns={seminarFinanceColumns}
            facetedFilters={seminarFinanceFacetedFilters}
            getRowKey={(row) => row.id}
            searchPlaceholder="Buscar seminario por instructor"
            textFilterColumnId="instructorName"
            selectableRows
            selectedRowIds={selectedSeminarIds}
            onSelectedRowIdsChange={setSelectedSeminarIds}
            // By the seminar's moment, which is the order every seminar list
            // opens in on both sides.
            initialSort={{ columnId: "scheduledDate", direction: "asc" }}
            emptyMessage="No hay seminarios para mostrar."
          />
        </TabsContent>
      </Tabs>
    </PortalListPage>
  );
}
