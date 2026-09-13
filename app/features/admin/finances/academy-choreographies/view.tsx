import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/features/admin/schedules/view-shared";
import {
  choreographyStatusFilterOptions,
  formatInscriptionStatusBadge,
} from "@/lib/finances/choreography-financial-status";
import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import {
  resolveSelectedOperationalTotals,
  sumOperationalFinanceRows,
} from "@/lib/finances/selected-operational-totals";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import { FinancePresetDialog } from "./preset-dialog";
import { financePresetLabels } from "./presets";
import type { AcademyFinancesLoaderData } from "./types";

type ChoreographyFinanceRow =
  AcademyFinancesLoaderData["choreographyFinanceRows"][number];

type SeminarFinanceRow =
  AcademyFinancesLoaderData["seminarFinanceRows"][number];

/** The tab the page opens on, and the one the URL does not have to name. */
const choreographiesTabValue = "coreografias";
const seminarsTabValue = "seminarios";
const financeTabParam = "seccion";

export const academyChoreographyFinanceFacetedFilterIds = ["estado"] as const;

const choreographyFinanceFacetedFilters: DataTableFacetedFiltersOf<
  typeof academyChoreographyFinanceFacetedFilterIds
> = [
  {
    id: "estado",
    label: "Estado",
    options: [...choreographyStatusFilterOptions],
  },
];

type AcademyFinancesRouteViewProps = {
  /** Preset open on mount. Only the tests use it, as in the payment detail. */
  initialPresetStage?: CobroStage | null;
  loaderData: AcademyFinancesLoaderData;
};

export function AcademyFinancesRouteView({
  initialPresetStage = null,
  loaderData,
}: AcademyFinancesRouteViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab =
    searchParams.get(financeTabParam) === seminarsTabValue
      ? seminarsTabValue
      : choreographiesTabValue;
  // **One selection per tab, kept side by side.** They are not one state
  // narrowed by the active tab: switching tabs and coming back would then have
  // silently dropped what was selected, and the two presets read the
  // choreography one whichever tab is open.
  const [selectedChoreographyIds, setSelectedChoreographyIds] = useState<
    string[]
  >([]);
  const [selectedSeminarIds, setSelectedSeminarIds] = useState<string[]>([]);
  const [presetStage, setPresetStage] = useState<CobroStage | null>(
    initialPresetStage,
  );
  const choreographyColumns = useMemo(
    () => buildChoreographyFinanceColumns(loaderData.academy.id),
    [loaderData.academy.id],
  );
  const seminarColumns = useMemo(
    () => buildSeminarFinanceColumns(loaderData.academy.id),
    [loaderData.academy.id],
  );
  // The four threshold-and-owed figures follow the active tab: they are that
  // kind's debt, summed over that kind's rows. `Saldo disponible` never moves —
  // it is the academy's pool, one for both kinds.
  const choreographyThresholds = sumOperationalFinanceRows(
    loaderData.choreographyFinanceRows,
  );
  const seminarThresholds = sumOperationalFinanceRows(
    loaderData.seminarFinanceRows,
  );
  // The collection operates on the selection, so the two owed figures follow it:
  // leaving them at the tab's total forces adding up from memory how much is
  // about to be collected.
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
  // Stable so the dialog can close itself from an effect when the write
  // succeeds without the effect re-running on every render of the list.
  const handlePresetOpenChange = useCallback((next: boolean) => {
    setPresetStage((current) => (next ? current : null));
  }, []);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={loaderData.academy.name}
      description="Lista financiera de las coreografías y los seminarios de esta academia."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar las finanzas",
        description:
          "Activá un evento para consultar la lista financiera de las coreografías de la academia.",
      }}
      headerAction={
        // The menu is always there: a button that comes and goes with the
        // selection hides what can be done here. With no rows selected both
        // collections are disabled —there is nothing to collect against— but
        // they stay in view.
        //
        // **The two presets act on choreographies only**, whichever tab is
        // open: there is no seminar preset, and reading the seminar selection
        // here would offer one that does not exist.
        <ResourceActionsMenu contentClassName="w-48">
          <DropdownMenuItem
            disabled={!choreographyTotals.hasSelection}
            onSelect={(event) => {
              event.preventDefault();
              setPresetStage("deposit");
            }}
          >
            {financePresetLabels.deposit}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!choreographyTotals.hasSelection}
            onSelect={(event) => {
              event.preventDefault();
              setPresetStage("balance");
            }}
          >
            {financePresetLabels.balance}
          </DropdownMenuItem>
        </ResourceActionsMenu>
      }
    >
      <div className="flex flex-col gap-6">
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
            <TabsTrigger value={choreographiesTabValue}>
              Coreografías
            </TabsTrigger>
            <TabsTrigger value={seminarsTabValue}>Seminarios</TabsTrigger>
          </TabsList>
          <TabsContent value={choreographiesTabValue} className="pt-2">
            <ClientDataTable
              rows={loaderData.choreographyFinanceRows}
              columns={choreographyColumns}
              facetedFilters={choreographyFinanceFacetedFilters}
              getRowKey={(row) => row.id}
              searchPlaceholder="Buscar coreografía por número o nombre"
              textFilterColumnId="name"
              // Higher than the default ten because the two collections act on
              // the selection: an academy whose choreographies span pages is
              // one whose deposit cannot be collected in a single reading. The
              // rows are all here already, so this costs a longer page and
              // nothing else.
              pageSize={25}
              selectableRows
              selectedRowIds={selectedChoreographyIds}
              onSelectedRowIdsChange={setSelectedChoreographyIds}
              // By number, like the choreography lists: it is the row's
              // identity within the event, so it is what the list is ordered
              // by.
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
              columns={seminarColumns}
              facetedFilters={choreographyFinanceFacetedFilters}
              getRowKey={(row) => row.id}
              searchPlaceholder="Buscar seminario por instructor"
              textFilterColumnId="instructorName"
              pageSize={25}
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
      </div>

      {presetStage !== null && choreographyTotals.selectedRows.length > 0 ? (
        <FinancePresetDialog
          availableBalanceAmount={loaderData.summary.availableBalanceAmount}
          inscriptions={loaderData.inscriptions}
          open
          onOpenChange={handlePresetOpenChange}
          priceOptionsByGroupType={loaderData.priceOptionsByGroupType}
          pricingScheduleIdByChoreography={
            loaderData.pricingScheduleIdByChoreography
          }
          selectedRows={choreographyTotals.selectedRows}
          stage={presetStage}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

/**
 * The `Seminarios` tab's rows: one `(seminar, academy)` unit each. The
 * instructor is the link — a seminar is named by who teaches it — and
 * `Inscriptos` is the academy's own active count and not the seminar's
 * occupancy: a place is taken by covering the deposit, not by registering.
 */
function buildSeminarFinanceColumns(
  academyId: string,
): DataTableColumn<SeminarFinanceRow>[] {
  return [
    {
      id: "instructorName",
      header: "Seminario",
      className: "min-w-56 font-medium",
      cell: (row) => (
        <DataTableLink
          to={`/administracion/finanzas/${academyId}/seminarios/${row.id}`}
        >
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
      // The filter comes from the same badge the cell shows, for the same
      // reason it does on the choreography tab.
      filterValue: (row) => formatSeminarStatusBadge(row).value,
    },
  ];
}

function formatSeminarStatusBadge(row: SeminarFinanceRow) {
  return formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({
      anomalies: row.anomalies,
      financialStatus: row.financialStatus,
    }),
  );
}

function buildChoreographyFinanceColumns(
  academyId: string,
): DataTableColumn<ChoreographyFinanceRow>[] {
  return [
    {
      id: "choreographyNumber",
      header: "#",
      className: "w-16 font-medium tabular-nums",
      headerClassName: "w-16",
      cell: (row) => (
        <DataTableLink
          to={`/administracion/finanzas/${academyId}/coreografias/${row.id}`}
        >
          {formatEventSequenceNumber(row.choreographyNumber)}
        </DataTableLink>
      ),
      sortValue: (row) => row.choreographyNumber,
    },
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      // The number is the row's only way into the detail, as in the
      // choreography lists. Linking the name too gave one destination two
      // targets, which reads as a choice and is not.
      cell: (row) => row.name,
      // The search box filters this one column, so the number travels in here
      // to be searchable at all. Zero-padded, which is what makes `00042`,
      // `042` and `42` all reach the same choreography.
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
      cell: (row) => <ChoreographyStatusCell row={row} />,
      // The filter comes from the same badge the cell shows, not from
      // `financialStatus`: a row badged `Sobreasignada` that turned up while
      // filtering by `Señada` would contradict itself on screen.
      filterValue: (row) => formatChoreographyStatusBadge(row).value,
    },
  ];
}

/**
 * An anomaly **replaces** the status badge, it does not accompany it: the two
 * compete for the same glance, and `Señada` next to `Sobreasignada` reads as two
 * facts of the same weight when only one of them asks anybody to do anything.
 *
 * The precedence between axes lives in `resolveInscriptionStatusBadge` and is
 * explicit, not positional: a new derived axis stacks on top by declaring
 * itself there, without depending on the order in which someone pushed its
 * anomaly into the array.
 */
function formatChoreographyStatusBadge(row: ChoreographyFinanceRow) {
  return formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({
      anomalies: row.anomalies,
      financialStatus: row.financialStatus,
    }),
  );
}

function ChoreographyStatusCell({ row }: { row: ChoreographyFinanceRow }) {
  const badge = formatChoreographyStatusBadge(row);

  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}
