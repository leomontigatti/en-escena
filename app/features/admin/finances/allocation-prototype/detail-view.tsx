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
 *   choreography**.
 * - **No bulk actions and no selection.** `Pagar seña` / `Pagar saldo` are list
 *   actions on the *choreography list*, which covers the common path; here an
 *   allocation is resolved **per inscription**, from the row action. The old
 *   per-row instance actions of the same name are gone — they were ladder rungs.
 * - **Anomalies are alerts, not badges**, sitting above the metric cards: an
 *   over-allocation or a price of the wrong group type is a must-fix problem,
 *   not a way a row can be. The copy is generic — it does not enumerate rows.
 * - **No search box**: a choreography's roster is short enough to read.
 *
 * Declared exception: no loader, no `action`, no server validation. The data is
 * a fixture, because the allocation table's shape is still open in #549.
 */
import { useSearchParams } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { ClientDataTable } from "@/components/shared/client-data-table";
import { MetricCard } from "@/components/shared/metric-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { formatAmount } from "../formatters";
import { ChoreographyAnomalyAlerts } from "./anomaly-alerts";
import { inscriptionColumns } from "./detail-table";
import type { InscriptionReading } from "./fixtures";
import { ManualAllocateDialog } from "./manual-allocate-dialog";
import { PaymentCoverage } from "./payment-coverage";
import { StateReadout } from "./state-readout";
import { usePrototype } from "./store";

export function AllocationDetailPrototypeView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const prototype = usePrototype();

  const choreographyId =
    searchParams.get("coreografia") ?? prototype.choreographies[0].id;
  const choreography =
    prototype.choreographies.find((row) => row.id === choreographyId) ??
    prototype.choreographies[0];

  // The allocate dialog is opened by the URL, not by row state: the name in the
  // `Bailarín` column links to `?asignar=<id>`. No memoised column factory is
  // needed as a result, and the dialog survives a reload.
  const manualTarget =
    prototype.inscriptions.find(
      (row) => row.id === searchParams.get("asignar"),
    ) ?? null;

  function closeManual() {
    const next = new URLSearchParams(searchParams);
    next.delete("asignar");
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }

  return (
    <AdminResourceLayout
      title={`${choreography.name} · ${choreography.groupType}`}
      description="Detalle financiero de una coreografía. Prototipo descartable del ticket #550; los datos están en memoria y no se guarda nada."
      requireSelectedEvent={false}
    >
      <div className="flex flex-col gap-6 pb-24">
        <Alert>
          <AlertTitle>Prototipo, no funcionalidad</AlertTitle>
          <AlertDescription>
            Vista 2 de 2. Se asigna por inscripción: el nombre del bailarín abre
            el diálogo. «Pagar seña» y «Pagar saldo» son acciones de la lista de
            coreografías.
          </AlertDescription>
        </Alert>

        {/* Above the metric cards, where the badges used to sit. */}
        <ChoreographyAnomalyAlerts
          groupType={choreography.groupType}
          inscriptions={choreography.inscriptions}
        />

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            title="Seña"
            value={formatAmount(choreography.depositAmount)}
          />
          <MetricCard
            title="Seña adeudada"
            value={formatAmount(choreography.owedDepositAmount)}
          />
          <MetricCard
            title="Total"
            value={formatAmount(choreography.totalAmount)}
          />
          <MetricCard
            title="Saldo adeudado"
            value={formatAmount(choreography.owedBalanceAmount)}
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

        <ClientDataTable<InscriptionReading>
          rows={choreography.inscriptions}
          columns={inscriptionColumns}
          getRowKey={(row) => row.id}
          initialSort={{ columnId: "dancer", direction: "asc" }}
          emptyMessage="No hay inscripciones para mostrar."
          // Required even when hidden — the real detail view passes it the same
          // way. Worth collapsing into `hideSearch` when this is implemented.
          searchPlaceholder="Buscar inscripción por bailarín"
          hideSearch
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

      <ManualAllocateDialog
        inscription={manualTarget}
        state={prototype.state}
        choreographyGroupType={choreography.groupType}
        availableBalanceAmount={prototype.academy.availableBalanceAmount}
        onClose={closeManual}
        onSelectPrice={prototype.onSelectPrice}
        onAllocate={prototype.onAllocate}
      />
    </AdminResourceLayout>
  );
}
