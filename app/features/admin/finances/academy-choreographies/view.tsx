import { useCallback, useMemo, useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  choreographyStatusFilterOptions,
  formatInscriptionStatusBadge,
} from "@/lib/finances/choreography-financial-status";
import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { resolveSelectedOperationalTotals } from "@/lib/finances/selected-operational-totals";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import { FinancePresetDialog } from "./preset-dialog";
import { financePresetLabels } from "./presets";
import type { AcademyFinancesLoaderData } from "./types";

type ChoreographyFinanceRow =
  AcademyFinancesLoaderData["choreographyFinanceRows"][number];

const choreographyFinanceFacetedFilters: DataTableFacetedFilter[] = [
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
  // The selection is lifted out of the table because it drives more than the
  // table: the two presets read it, and only it decides whether they are
  // offered at all.
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [presetStage, setPresetStage] = useState<CobroStage | null>(
    initialPresetStage,
  );
  const columns = useMemo(
    () => buildChoreographyFinanceColumns(loaderData.academy.id),
    [loaderData.academy.id],
  );
  // The collection operates on the selection, so the two owed figures follow it:
  // leaving them at the academy's total forces adding up from memory how much is
  // about to be collected.
  const { hasSelection, owedBalanceAmount, owedDepositAmount, selectedRows } =
    resolveSelectedOperationalTotals({
      rows: loaderData.choreographyFinanceRows,
      selectedRowIds,
      summary: loaderData.summary,
    });
  // Stable so the dialog can close itself from an effect when the write
  // succeeds without the effect re-running on every render of the list.
  const handlePresetOpenChange = useCallback((next: boolean) => {
    setPresetStage((current) => (next ? current : null));
  }, []);

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
      headerAction={
        // The menu is always there: a button that comes and goes with the
        // selection hides what can be done here. With no rows selected both
        // collections are disabled —there is nothing to collect against— but
        // they stay in view.
        <ResourceActionsMenu contentClassName="w-48">
          <DropdownMenuItem
            disabled={!hasSelection}
            onSelect={(event) => {
              event.preventDefault();
              setPresetStage("deposit");
            }}
          >
            {financePresetLabels.deposit}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasSelection}
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
        {/* The two owed figures re-scope to the selection; the thresholds and the
            available balance do not. */}
        <OperationalFinanceMetrics
          availableBalanceAmount={loaderData.summary.availableBalanceAmount}
          depositAmount={loaderData.summary.depositAmount}
          owedBalanceAmount={owedBalanceAmount}
          owedDepositAmount={owedDepositAmount}
          totalAmount={loaderData.summary.totalAmount}
        />

        <ClientDataTable
          rows={loaderData.choreographyFinanceRows}
          columns={columns}
          facetedFilters={choreographyFinanceFacetedFilters}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar coreografía por número o nombre"
          textFilterColumnId="name"
          selectableRows
          selectedRowIds={selectedRowIds}
          onSelectedRowIdsChange={setSelectedRowIds}
          // By number, like the choreography lists: it is the row's identity
          // within the event, so it is what the list is ordered by.
          initialSort={{
            columnId: "choreographyNumber",
            direction: "asc",
          }}
          emptyMessage="No hay coreografías para mostrar."
        />
      </div>

      {presetStage !== null && selectedRows.length > 0 ? (
        <FinancePresetDialog
          availableBalanceAmount={loaderData.summary.availableBalanceAmount}
          open
          onOpenChange={handlePresetOpenChange}
          priceOptionsByGroupType={loaderData.priceOptionsByGroupType}
          pricingScheduleIdByChoreography={
            loaderData.pricingScheduleIdByChoreography
          }
          selectedRows={selectedRows}
          stage={presetStage}
        />
      ) : null}
    </AdminResourceLayout>
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
