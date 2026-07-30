/**
 * THROWAWAY PROTOTYPE — ticket #550 of map #547. View 1 of 2.
 *
 * An academy's financial choreography list (`/administracion/finanzas/:academyId`
 * in the real app). There are no variants any more: A won, with the corrections
 * asked for on reacting to the prototype.
 *
 * `Pagar seña` and `Pagar saldo` are **list actions** (#551) and live where every
 * action in this repo lives: the header's `ResourceActionsMenu`, disabled until
 * at least one choreography is selected.
 *
 * Declared exception: there is no loader, no `action` and no server validation.
 * `ServerDataTable` navigates with `q`, `orden` and `page`, and they are resolved
 * in memory here because the data is a fixture: the table's shape is still open
 * in #549.
 */
import { useState } from "react";
import { useSearchParams } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { ServerDataTable } from "@/components/shared/server-data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { compareSortValues } from "@/components/shared/data-table-helpers";
import {
  dataTableFacetedFilterColumnId,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table.shared";

import { formatAmount } from "../formatters";
import { inscriptionStatusLabels } from "./fixtures";
import { buildChoreographyColumns } from "./list-table";
import { PresetDialog } from "./preset-dialog";
import { presetLabels, type PresetKind } from "./presets";
import type { ChoreographyReading } from "./rollup";
import { StateReadout } from "./state-readout";
import { usePrototype } from "./store";

const pageSize = 10;

export function AllocationListPrototypeView() {
  const [searchParams] = useSearchParams();
  const prototype = usePrototype();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<PresetKind | null>(null);

  const selected = prototype.choreographies.filter((row) =>
    selectedIds.includes(row.id),
  );
  const rows = readRows(prototype.choreographies, searchParams);
  const currentPage = Number(searchParams.get("page") ?? "1");
  const pageRows = rows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
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
            disabled={selected.length === 0}
            onSelect={(event) => {
              event.preventDefault();
              setPreset("deposit");
            }}
          >
            {presetLabels.deposit}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={selected.length === 0}
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

        <ServerDataTable
          rows={pageRows}
          columns={buildChoreographyColumns({
            selectedIds,
            allSelected:
              rows.length > 0 &&
              rows.every((row) => selectedIds.includes(row.id)),
            someSelected: rows.some((row) => selectedIds.includes(row.id)),
            onToggle: (id) =>
              setSelectedIds((current) =>
                current.includes(id)
                  ? current.filter((value) => value !== id)
                  : [...current, id],
              ),
            onToggleAll: (checked) =>
              setSelectedIds(checked ? rows.map((row) => row.id) : []),
          })}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar coreografía por nombre"
          initialSearchValue={searchParams.get("q") ?? ""}
          facetedFilters={choreographyFacetedFilters}
          initialFacetedFilterValues={readFilterValues(searchParams)}
          currentPage={currentPage}
          totalPages={Math.max(1, Math.ceil(rows.length / pageSize))}
          totalRows={prototype.choreographies.length}
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

function readFilterValues(searchParams: URLSearchParams) {
  const values: Record<string, string> = {};

  for (const group of choreographyFacetedFilters) {
    const value = searchParams.get(group.id ?? group.label);

    if (value) {
      values[group.id ?? group.label] = value;
    }
  }

  return Object.keys(values).length > 0
    ? { [dataTableFacetedFilterColumnId]: values }
    : undefined;
}

/**
 * Search, filter and sort, resolved in memory over what `ServerDataTable` put in
 * the URL. Name is the only sortable column.
 */
function readRows(
  choreographies: ChoreographyReading[],
  searchParams: URLSearchParams,
) {
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const groupType = searchParams.get("tipo");
  const status = searchParams.get("estado");

  const rows = choreographies.filter((row) => {
    if (query !== "" && !row.name.toLowerCase().includes(query)) {
      return false;
    }

    if (groupType !== null && row.groupType !== groupType) {
      return false;
    }

    return status === null || row.status === status;
  });

  const direction = (searchParams.get("orden") ?? "name:asc").split(":")[1];

  return rows.sort((left, right) => {
    const comparison = compareSortValues(left.name, right.name);
    return direction === "desc" ? -comparison : comparison;
  });
}

function sumBy<T>(rows: T[], read: (row: T) => number) {
  return rows.reduce((total, row) => total + read(row), 0);
}
