import { useCallback, useMemo, useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  choreographyStatusFilterOptions,
  formatInscriptionStatusBadge,
} from "@/lib/finances/choreography-financial-status";
import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import { formatAmount, formatOperationalAmount } from "../formatters";
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
  const selectedRows = loaderData.choreographyFinanceRows.filter((row) =>
    selectedRowIds.includes(row.id),
  );
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
        selectedRows.length > 0 ? (
          <ResourceActionsMenu contentClassName="w-48">
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setPresetStage("deposit");
              }}
            >
              {financePresetLabels.deposit}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setPresetStage("balance");
              }}
            >
              {financePresetLabels.balance}
            </DropdownMenuItem>
          </ResourceActionsMenu>
        ) : undefined
      }
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
          columns={columns}
          facetedFilters={choreographyFinanceFacetedFilters}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar coreografía por nombre"
          textFilterColumnId="name"
          selectableRows
          selectedRowIds={selectedRowIds}
          onSelectedRowIdsChange={setSelectedRowIds}
          initialSort={{
            columnId: "name",
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
      // Decorativo y sin condición: `Total` es la columna de contexto —contra qué
      // se mide lo adeudado—, así que va atenuada entera. Nunca por fila: un gris
      // que varía vuelve a significar algo.
      className: "text-right tabular-nums text-muted-foreground",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.totalAmount),
    },
    {
      id: "owedBalanceAmount",
      header: "Saldo adeudado",
      // La única cifra accionable de la fila, destacada por columna.
      className: "text-right font-medium tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.owedBalanceAmount),
    },
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
 * Una anomalía **reemplaza** al badge de estado, no lo acompaña: los dos compiten
 * por la misma mirada, y `Señada` al lado de `Sobreasignada` se lee como dos
 * hechos del mismo peso cuando sólo uno pide que alguien haga algo.
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
