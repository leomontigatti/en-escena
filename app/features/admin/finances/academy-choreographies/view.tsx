import { useCallback, useMemo, useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  billingFacet,
  billingFacetId,
  PaymentAndBillingBadges,
} from "@/components/shared/billing-status-badge";
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
import { renderInscriptionStatusFilterValue } from "@/lib/finances/inscription-finance-columns";
import {
  choreographiesTabValue,
  movementsTabValue,
  seminarsTabValue,
  useFinanceTabs,
} from "@/lib/finances/finance-tabs";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import { BulkEmissionBlockedDialog } from "@/features/admin/finances/comprobante-emission/blocked-dialog";
import { BulkEmissionDialog } from "@/features/admin/finances/comprobante-emission/bulk-dialog";
import { OwnerMovementsTab } from "@/features/admin/finances/owner-movements/tab";
import { FinancePresetDialog } from "./preset-dialog";
import { financePresetLabels, type FinancePresetTarget } from "./presets";
import { SeminarPresetDialog } from "./seminar-preset-dialog";
import type { AcademyFinancesLoaderData } from "./types";

function presetTargetOf(tab: string): FinancePresetTarget {
  return tab === seminarsTabValue ? "seminars" : "choreographies";
}

/**
 * What the header menu can do from the open tab: the presets act on its
 * selection and the bulk emission on the choreographies' only. The
 * `Movimientos` tab has no selection, so nothing is collected from it.
 */
function headerActionsOf(
  tab: string,
  hasSelection: Record<FinancePresetTarget, boolean>,
) {
  if (tab === movementsTabValue) {
    return { canCollect: false, canEmit: false };
  }

  const target = presetTargetOf(tab);

  return {
    canCollect: hasSelection[target],
    canEmit: target === "choreographies" && hasSelection.choreographies,
  };
}

type ChoreographyFinanceRow =
  AcademyFinancesLoaderData["choreographyFinanceRows"][number];

type SeminarFinanceRow =
  AcademyFinancesLoaderData["seminarFinanceRows"][number];

export const academyChoreographyFinanceFacetedFilterIds = [
  "estado",
  billingFacetId,
] as const;

const choreographyFinanceFacetedFilters: DataTableFacetedFiltersOf<
  typeof academyChoreographyFinanceFacetedFilterIds
> = [
  {
    id: "estado",
    label: "Estado",
    options: [...choreographyStatusFilterOptions],
    renderValue: renderInscriptionStatusFilterValue,
  },
  billingFacet,
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
  // The tabs, their two selections and the figures that follow them are the
  // portal summary's as well (`useFinanceTabs`); the two presets below read the
  // choreography selection, and are this page's alone.
  const {
    activeTab,
    activeThresholds,
    activeTotals,
    choreographyTotals,
    onTabChange,
    seminarTotals,
    selectedChoreographyIds,
    selectedSeminarIds,
    setSelectedChoreographyIds,
    setSelectedSeminarIds,
  } = useFinanceTabs({ ...loaderData, withMovementsTab: true });
  // The preset remembers the tab it was opened from, which is the selection it
  // acts on.
  const [preset, setPreset] = useState<{
    stage: CobroStage;
    target: FinancePresetTarget;
  } | null>(() =>
    initialPresetStage === null
      ? null
      : { stage: initialPresetStage, target: presetTargetOf(activeTab) },
  );
  // The selection a bulk emission was opened on, and whether a live
  // reservation blocked it then: both held, so the run keeps its rows and its
  // dialog whatever the list reads after each emission, a reservation the run
  // itself left behind included.
  const [bulkEmission, setBulkEmission] = useState<{
    ids: string[];
    blockedReason: string | null;
  } | null>(null);
  const activeTarget = presetTargetOf(activeTab);
  const { canCollect, canEmit } = headerActionsOf(activeTab, {
    choreographies: choreographyTotals.hasSelection,
    seminars: seminarTotals.hasSelection,
  });
  const choreographyColumns = useMemo(
    () => buildChoreographyFinanceColumns(loaderData.academy.id),
    [loaderData.academy.id],
  );
  const seminarColumns = useMemo(
    () => buildSeminarFinanceColumns(loaderData.academy.id),
    [loaderData.academy.id],
  );
  // Stable so the dialog can close itself from an effect when the write
  // succeeds without the effect re-running on every render of the list.
  const handlePresetOpenChange = useCallback((next: boolean) => {
    setPreset((current) => (next ? current : null));
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
        // **The two presets act on the open tab's selection**: an action never
        // reaches rows out of sight, so a choreography selection does not
        // enable them on the seminar tab, nor the reverse.
        <ResourceActionsMenu contentClassName="w-48">
          <DropdownMenuItem
            disabled={!canCollect}
            onSelect={() =>
              setPreset({ stage: "deposit", target: activeTarget })
            }
          >
            {financePresetLabels.deposit}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canCollect}
            onSelect={() =>
              setPreset({ stage: "balance", target: activeTarget })
            }
          >
            {financePresetLabels.balance}
          </DropdownMenuItem>
          {/* The choreographies' only: it acts on the choreography tab's
              selection, and a seminar unit emits from its own detail. */}
          <DropdownMenuItem
            disabled={!canEmit}
            onSelect={() =>
              setBulkEmission({
                ids: choreographyTotals.selectedRows.map((row) => row.id),
                blockedReason: loaderData.bulkEmission.blocked?.reason ?? null,
              })
            }
          >
            Emitir comprobantes
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

        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList variant="line">
            <TabsTrigger value={choreographiesTabValue}>
              Coreografías
            </TabsTrigger>
            <TabsTrigger value={seminarsTabValue}>Seminarios</TabsTrigger>
            <TabsTrigger value={movementsTabValue}>Movimientos</TabsTrigger>
          </TabsList>
          <TabsContent value={choreographiesTabValue} className="pt-2">
            <ClientDataTable
              rows={loaderData.choreographyFinanceRows}
              columns={choreographyColumns}
              facetedFilters={choreographyFinanceFacetedFilters}
              getRowKey={(row) => row.id}
              searchPlaceholder="Buscar por número o nombre"
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
              searchPlaceholder="Buscar por instructor"
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
          <TabsContent value={movementsTabValue} className="pt-2">
            <OwnerMovementsTab movements={loaderData.movements} />
          </TabsContent>
        </Tabs>
      </div>

      {preset?.target === "choreographies" &&
      choreographyTotals.selectedRows.length > 0 ? (
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
          stage={preset.stage}
        />
      ) : null}
      {bulkEmission?.blockedReason ? (
        <BulkEmissionBlockedDialog
          onOpenChange={() => setBulkEmission(null)}
          open
          reason={bulkEmission.blockedReason}
        />
      ) : null}
      {bulkEmission && bulkEmission.blockedReason === null ? (
        <BulkEmissionDialog
          bulkEmission={loaderData.bulkEmission}
          choreographies={loaderData.choreographyFinanceRows}
          onOpenChange={() => setBulkEmission(null)}
          open
          selectedIds={bulkEmission.ids}
        />
      ) : null}
      {preset?.target === "seminars" && seminarTotals.hasSelection ? (
        <SeminarPresetDialog
          availableBalanceAmount={loaderData.summary.availableBalanceAmount}
          onOpenChange={handlePresetOpenChange}
          previews={loaderData.seminarPresetPreviews}
          selectedSeminarIds={seminarTotals.selectedRows.map((row) => row.id)}
          stage={preset.stage}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

/**
 * The `Seminarios` tab's rows: one `(seminar, academy)` unit each. The
 * instructor is the link — a seminar is named by who teaches it — and
 * `Inscriptos` is the academy's own active count plus its linked individuals'
 * inscriptions, as on the academy's portal, and not the seminar's occupancy: a
 * place is taken by covering the deposit, not by registering.
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
          recordTitle
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
      cell: (row) => (
        <PaymentAndBillingBadges
          billingStatus={row.billingStatus}
          status={resolveSeminarStatus(row)}
        />
      ),
      // The filters come from the same badges the cell shows, for the same
      // reason they do on the choreography tab.
      filterValues: (row) => [
        formatInscriptionStatusBadge(resolveSeminarStatus(row)).value,
        row.billingStatus ?? "",
      ],
    },
  ];
}

function resolveSeminarStatus(row: SeminarFinanceRow) {
  return resolveInscriptionStatusBadge({
    anomalies: row.anomalies,
    financialStatus: row.financialStatus,
    withdrawn: row.withdrawn,
  });
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
      cell: (row) => formatEventSequenceNumber(row.choreographyNumber),
      sortValue: (row) => row.choreographyNumber,
    },
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      // The name is the row's only way into the detail, as in the
      // choreography lists. Linking the number too gave one destination two
      // targets, which reads as a choice and is not.
      cell: (row) => (
        <DataTableLink
          recordTitle
          to={`/administracion/finanzas/${academyId}/coreografias/${row.id}`}
        >
          {row.name}
        </DataTableLink>
      ),
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
      cell: (row) => (
        <PaymentAndBillingBadges
          billingStatus={row.billingStatus}
          status={resolveChoreographyStatus(row)}
        />
      ),
      // The filters come from the same badges the cell shows, not from
      // `financialStatus`: a row badged `Sobreasignada` that turned up while
      // filtering by `Señada` would contradict itself on screen.
      filterValues: (row) => [
        formatInscriptionStatusBadge(resolveChoreographyStatus(row)).value,
        row.billingStatus ?? "",
      ],
    },
  ];
}

/**
 * An anomaly **replaces** the status badge, it does not accompany it: the two
 * compete for the same glance, and `Señada` next to `Sobreasignada` reads as two
 * facts of the same weight when only one of them asks anybody to do anything.
 * `Retirada` replaces both, for the same reason and with more right to: a
 * withdrawn choreography is not going to happen, so no reading of its money
 * answers *can it happen as registered?*.
 *
 * The precedence between axes lives in `resolveInscriptionStatusBadge` and is
 * explicit, not positional: a new derived axis stacks on top by declaring
 * itself there, without depending on the order in which someone pushed its
 * anomaly into the array.
 */
function resolveChoreographyStatus(row: ChoreographyFinanceRow) {
  return resolveInscriptionStatusBadge({
    anomalies: row.anomalies,
    financialStatus: row.financialStatus,
    withdrawn: row.withdrawn,
  });
}
