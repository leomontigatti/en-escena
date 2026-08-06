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
 *   over-allocation is a must-fix problem, not a way a row can be. The copy is
 *   generic — it does not enumerate rows. (`groupTypeMismatch` was the other
 *   one; #586 deleted it, and the slot is now empty.)
 * - **No search box**: a choreography's roster is short enough to read.
 * - The dancer's name opens the allocate dialog from **row state**, the way
 *   `DancerNameCell` already does it in the real view.
 *
 * Declared exception: no loader, no `action`, no server validation. The data is
 * a fixture, because the allocation table's shape is still open in #549.
 */
import { useSearchParams } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { ClientDataTable } from "@/components/shared/client-data-table";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { formatAmount } from "../formatters";
import { ChoreographyAnomalyAlerts } from "./anomaly-alerts";
import { inscriptionColumns } from "./detail-table";
import { DiscountSection } from "./discount-section";
import type { InscriptionReading } from "./fixtures";
import type { ChoreographyReading } from "./rollup";
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

  return (
    <AdminResourceLayout
      title={`${choreography.name} · ${choreography.groupType}`}
      description="Detalle financiero de una coreografía. Prototipo descartable de los tickets #550 y #585; los datos están en memoria y no se guarda nada."
      requireSelectedEvent={false}
      headerAction={<ChoreographyActions choreography={choreography} />}
    >
      <div className="flex flex-col gap-6 pb-24">
        <Alert>
          <AlertTitle>Prototipo, no funcionalidad</AlertTitle>
          <AlertDescription>
            Vista 2 de 2. Se asigna por inscripción: el nombre del bailarín abre
            el diálogo, igual que en la vista real. «Pagar seña» y «Pagar saldo»
            son acciones de la lista de coreografías.
          </AlertDescription>
        </Alert>

        {/* Above the metric cards, where the badges used to sit. */}
        <ChoreographyAnomalyAlerts inscriptions={choreography.inscriptions} />

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

        <DiscountSection choreography={choreography} />

        {/*
          Prototype-only: the roster of *other* choreographies is what moves this
          one's bill, and there is no other way to see it happen.
        */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
          <span className="text-xs font-medium text-muted-foreground">
            Mover el elenco en otra coreografía
          </span>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={() => prototype.onRegisterSibling("dan-emilia", "cho-5")}
          >
            Reinscribir a Emilia en «Brisa»
          </Button>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={() => prototype.onWithdrawSibling("ins-11")}
          >
            Dar de baja a Ana en «Ecos»
          </Button>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={() => prototype.onRegisterSibling("dan-delfina", "cho-4")}
          >
            Inscribir a Delfina en «Ecos»
          </Button>
        </div>

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
    </AdminResourceLayout>
  );
}

/**
 * The header actions menu, where the real view already keeps `Emitir factura`
 * (`choreography-detail/view.tsx:289-310`).
 *
 * **`Imprimir factura` appears only once a comprobante exists** — it is not a
 * disabled item, because there is nothing to enable: the document either was
 * emitted or was not. The two are mutually exclusive for the same reason
 * decision 16 gives — **one factura per choreography** — so the menu never
 * offers both at once.
 *
 * **The amendment sits below `Imprimir factura`, and only when one is owed.**
 * There is a single item, never a pair to choose between: the sign of the delta
 * names the document (#599), so offering both would invite the admin to pick the
 * wrong one. Before emission the item is present and **disabled with no reason
 * appended** — a menu label is not the place to teach the rule, and the
 * emptiness reads plainly enough.
 */
function ChoreographyActions({
  choreography,
}: {
  choreography: ChoreographyReading;
}) {
  const prototype = usePrototype();
  const hasComprobante = choreography.comprobante !== null;
  // Decision 15: `Señada` is the gate, and it is a **minimum** across the
  // roster (#551), so one inscription short of its deposit blocks emission.
  const canEmit =
    !hasComprobante &&
    choreography.status !== null &&
    choreography.status !== "depositPending" &&
    choreography.totalAmount > 0;

  return (
    <ResourceActionsMenu contentClassName="w-56">
      {canEmit ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            prototype.onEmit(choreography.id);
          }}
        >
          Emitir factura
        </DropdownMenuItem>
      ) : null}
      {hasComprobante ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            window.print();
          }}
        >
          Imprimir factura
        </DropdownMenuItem>
      ) : null}
      {hasComprobante && choreography.delta !== 0 ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            prototype.onEmitAmendment(choreography.id);
          }}
        >
          {choreography.delta > 0
            ? "Emitir nota de débito"
            : "Emitir nota de crédito"}
        </DropdownMenuItem>
      ) : null}
      {!canEmit && !hasComprobante ? (
        <DropdownMenuItem disabled>Emitir factura</DropdownMenuItem>
      ) : null}
    </ResourceActionsMenu>
  );
}
