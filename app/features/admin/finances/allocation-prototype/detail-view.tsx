/**
 * THROWAWAY PROTOTYPE — ticket #550 of map #547. View 2 of 2.
 *
 * A choreography's financial detail
 * (`/administracion/finanzas/:academyId/coreografias/:choreographyId` in the
 * real app). There are no variants any more: **A won** — presets over a
 * selection, arbitrary amounts as the exception — rebuilt to sit beside the
 * detail view already in use rather than beside its two rejected siblings.
 *
 * What that meant concretely:
 *
 * - `ClientDataTable`, like the real view, instead of a hand-rolled `<Table>`.
 * - The **choreography's name as the title**, not "Detalle financiero", with the
 *   group type appended to it. The group type rides *inside* the title string
 *   rather than beside it as a badge, so `AdminResourceLayout.title` stays
 *   `string` and no shared component has to widen for this view.
 * - The same five `MetricCard`s as the choreography list, **bounded to this
 *   choreography**; the two owed figures re-scope to the selection exactly as
 *   they do on the list.
 * - `Pagar seña` / `Pagar saldo` in the header's `ResourceActionsMenu`, disabled
 *   until rows are chosen — the placement every action in this repo uses.
 *
 * Declared exception: no loader, no `action`, no server validation. The data is
 * a fixture, because the allocation table's shape is still open in #549.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { ClientDataTable } from "@/components/shared/client-data-table";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { formatAmount } from "../formatters";
import { buildInscriptionColumns } from "./detail-table";
import type { InscriptionReading } from "./fixtures";
import { ChoreographyAnomalyBadges } from "./list-shared";
import { ManualAllocateDialog } from "./manual-allocate-dialog";
import { PaymentCoverage } from "./payment-coverage";
import { PresetDialog } from "./preset-dialog";
import { presetLabels, type PresetKind } from "./presets";
import { StateReadout } from "./state-readout";
import { usePrototype } from "./store";

export function AllocationDetailPrototypeView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const prototype = usePrototype();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<PresetKind | null>(null);
  const [manualTarget, setManualTarget] = useState<InscriptionReading | null>(
    null,
  );

  const choreographyId =
    searchParams.get("coreografia") ?? prototype.choreographies[0].id;
  const choreography =
    prototype.choreographies.find((row) => row.id === choreographyId) ??
    prototype.choreographies[0];

  // Memoised for the reason the real view memoises: a fresh array every render
  // remounts the cells, and the row's dialog closes the instant it opens.
  const columns = useMemo(
    () => buildInscriptionColumns({ onAllocateByHand: setManualTarget }),
    [],
  );

  const selected = choreography.inscriptions.filter((row) =>
    selectedIds.includes(row.id),
  );
  const scoped = selected.length > 0;
  const owedDepositAmount = scoped
    ? sumBy(selected, (row) => row.owedDepositAmount ?? 0)
    : choreography.owedDepositAmount;
  const owedBalanceAmount = scoped
    ? sumBy(selected, (row) => row.owedBalanceAmount ?? 0)
    : choreography.owedBalanceAmount;

  return (
    <AdminResourceLayout
      title={`${choreography.name} · ${choreography.groupType}`}
      description="Detalle financiero de una coreografía. Prototipo descartable del ticket #550; los datos están en memoria y no se guarda nada."
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
            Vista 2 de 2. Los presets están en el menú de acciones del header y
            se habilitan al elegir inscripciones. El precio se fija con la
            primera asignación.
          </AlertDescription>
        </Alert>

        <ChoreographyAnomalyBadges anomalies={choreography.anomalies} />

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            title="Seña"
            value={formatAmount(choreography.depositAmount)}
          />
          <MetricCard
            title="Seña adeudada"
            value={formatAmount(owedDepositAmount)}
          />
          <MetricCard
            title="Total"
            value={formatAmount(choreography.totalAmount)}
          />
          <MetricCard
            title="Saldo adeudado"
            value={formatAmount(owedBalanceAmount)}
          />
          {/*
            The only card that stays academy-wide: payments are not scoped to a
            choreography, and this is the money available to spend on this one.
          */}
          <MetricCard
            title="Saldo disponible"
            value={formatAmount(prototype.academy.availableBalanceAmount)}
          />
        </section>

        <ClientDataTable
          rows={choreography.inscriptions}
          columns={columns}
          getRowKey={(row) => row.id}
          selectableRows
          selectedRowIds={selectedIds}
          onSelectedRowIdsChange={setSelectedIds}
          searchPlaceholder="Buscar inscripción por bailarín"
          textFilterColumnId="dancer"
          initialSort={{ columnId: "dancer", direction: "asc" }}
          emptyMessage="No hay inscripciones para mostrar."
          hidePagination
        />

        <PaymentCoverage
          payments={prototype.payments}
          inscriptions={prototype.inscriptions}
        />

        {/* Prototype-only: the real view reaches its siblings through the list. */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
          <span className="text-xs font-medium text-muted-foreground">
            Ir a otra coreografía
          </span>
          {prototype.choreographies.map((row) => (
            <Button
              key={row.id}
              type="button"
              size="xs"
              variant={row.id === choreography.id ? "default" : "outline"}
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("coreografia", row.id);
                setSelectedIds([]);
                setSearchParams(next, {
                  replace: true,
                  preventScrollReset: true,
                });
              }}
            >
              {row.name}
            </Button>
          ))}
        </div>

        <StateReadout />
      </div>

      {preset !== null ? (
        <PresetDialog
          kind={preset}
          targets={selected}
          payments={prototype.payments}
          open
          onClose={() => setPreset(null)}
          onApply={prototype.onApplyUpserts}
        />
      ) : null}

      <ManualAllocateDialog
        inscription={manualTarget}
        state={prototype.state}
        choreographyGroupType={choreography.groupType}
        availableBalanceAmount={prototype.academy.availableBalanceAmount}
        onClose={() => setManualTarget(null)}
        onSelectPrice={prototype.onSelectPrice}
        onAllocate={prototype.onAllocate}
      />
    </AdminResourceLayout>
  );
}

function sumBy<T>(rows: T[], read: (row: T) => number) {
  return rows.reduce((total, row) => total + read(row), 0);
}
