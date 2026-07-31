/**
 * THROWAWAY PROTOTYPE — ticket #550 of map #547. View 1 of 2.
 *
 * An academy's financial choreography list (`/administracion/finanzas/:academyId`
 * in the real app). There are no variants any more: A won, with the corrections
 * asked for on reacting to the prototype.
 *
 * `Pagar seña` and `Pagar saldo` are **list actions** (#551) and live where every
 * action in this repo lives: the header's `ResourceActionsMenu`, disabled until
 * at least one choreography is selected. The selection is lifted out of the table
 * because it drives more than the table: those two actions, and the two owed
 * figures above it.
 *
 * Declared exception: there is no loader, no `action` and no server validation.
 * The data is a fixture, because the allocation table's shape is still open
 * in #549.
 */
import { useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { ClientDataTable } from "@/components/shared/client-data-table";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import type { DataTableFacetedFilter } from "@/components/shared/data-table.shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { formatAmount } from "../formatters";
import { inscriptionStatusLabels } from "./fixtures";
import { choreographyColumns } from "./list-table";
import { PresetDialog } from "./preset-dialog";
import { presetLabels, type PresetKind } from "./presets";
import { StateReadout } from "./state-readout";
import { usePrototype } from "./store";

const choreographyFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "tipo",
    label: "Tipo de grupo",
    options: [
      { label: "Grupo", value: "Grupo" },
      { label: "Dúo", value: "Dúo" },
    ],
  },
  {
    id: "estado",
    label: "Estado",
    options: [
      {
        label: inscriptionStatusLabels.depositPending,
        value: "depositPending",
      },
      { label: inscriptionStatusLabels.depositMet, value: "depositMet" },
      { label: inscriptionStatusLabels.paidInFull, value: "paidInFull" },
    ],
  },
];

export function AllocationListPrototypeView() {
  const prototype = usePrototype();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<PresetKind | null>(null);

  const selected = prototype.choreographies.filter((row) =>
    selectedIds.includes(row.id),
  );

  // The two owed figures re-scope to the selection: the academy's with nothing
  // selected, the sum of the selected rows otherwise. That is the reading needed
  // to decide on a preset without leaving the list.
  const scoped = selected.length > 0;
  const owedDepositAmount = scoped
    ? sumBy(selected, (row) => row.owedDepositAmount)
    : prototype.academy.owedDepositAmount;
  const owedBalanceAmount = scoped
    ? sumBy(selected, (row) => row.owedBalanceAmount)
    : prototype.academy.owedBalanceAmount;

  return (
    <AdminResourceLayout
      title="Prototipo · lista financiera"
      description="Danza Viva — prototipo descartable del ticket #550. Datos en memoria, nada se guarda."
      requireSelectedEvent={false}
      headerAction={
        <ResourceActionsMenu>
          <DropdownMenuItem
            disabled={!scoped}
            onSelect={(event) => {
              event.preventDefault();
              setPreset("deposit");
            }}
          >
            {presetLabels.deposit}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!scoped}
            onSelect={(event) => {
              event.preventDefault();
              setPreset("balance");
            }}
          >
            {presetLabels.balance}
          </DropdownMenuItem>
        </ResourceActionsMenu>
      }
    >
      <div className="flex flex-col gap-6 pb-24">
        <Alert>
          <AlertTitle>Prototipo, no funcionalidad</AlertTitle>
          <AlertDescription>
            Vista 1 de 2. Los presets están en el menú de acciones del header y
            se habilitan al elegir coreografías. El nombre lleva al detalle.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            title="Seña"
            value={formatAmount(prototype.academy.depositAmount)}
          />
          <MetricCard
            title="Seña adeudada"
            value={formatAmount(owedDepositAmount)}
          />
          <MetricCard
            title="Total"
            value={formatAmount(prototype.academy.totalAmount)}
          />
          <MetricCard
            title="Saldo adeudado"
            value={formatAmount(owedBalanceAmount)}
          />
          <MetricCard
            title="Saldo disponible"
            value={formatAmount(prototype.academy.availableBalanceAmount)}
          />
        </section>

        <ClientDataTable
          rows={prototype.choreographies}
          columns={choreographyColumns}
          getRowKey={(row) => row.id}
          selectableRows
          selectedRowIds={selectedIds}
          onSelectedRowIdsChange={setSelectedIds}
          searchPlaceholder="Buscar coreografía por nombre"
          textFilterColumnId="name"
          facetedFilters={choreographyFacetedFilters}
          initialSort={{ columnId: "name", direction: "asc" }}
          emptyMessage="No hay coreografías para mostrar."
        />

        <StateReadout />
      </div>

      {preset !== null ? (
        <PresetDialog
          kind={preset}
          targets={selected.flatMap((row) => row.inscriptions)}
          payments={prototype.payments}
          open
          onClose={() => setPreset(null)}
          onApply={prototype.onApplyUpserts}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

function sumBy<T>(rows: T[], read: (row: T) => number) {
  return rows.reduce((total, row) => total + read(row), 0);
}
