/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547.
 *
 * A choreography's financial detail, the surface the `Descuentos` section is
 * proposed for. It runs inside the real admin shell so density and typography
 * are judged against the rest of the app, but there is no loader, no `action`,
 * no server validation and no React Hook Form: the state is a module fixture.
 *
 * The **audience toggle** is what makes the ticket's second open question
 * judgeable — whether the portal sees any of this. Declared shortcut: the
 * portal preview is rendered inside the admin shell with the admin-only
 * affordances removed, rather than as a second route behind portal auth.
 */
import { useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { MetricCard } from "@/components/shared/metric-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

import { formatAmount } from "../formatters";
import { DiscountSection } from "./discount-section";
import { RosterTable } from "./roster-table";
import { prototypeAudienceNames } from "./shared";
import { usePrototype } from "./store";
import { PrototypeSwitcher, usePrototypeSelection } from "./switcher";

export function DiscountProvenancePrototypeView() {
  const { variant, audience, select } = usePrototypeSelection();
  const prototype = usePrototype();
  const [highlightedDancerId, setHighlightedDancerId] = useState<string | null>(
    null,
  );

  const { choreography } = prototype;
  const active = choreography.inscriptions.filter(
    (row) => row.withdrawnAt === null,
  );
  const owedBalanceAmount = active.reduce(
    (total, row) => total + row.owedBalanceAmount,
    0,
  );
  const discountAmount = active.reduce(
    (total, row) => total + row.discountAmount,
    0,
  );

  return (
    <AdminResourceLayout
      title={`${choreography.name} · ${choreography.groupType}`}
      description="Detalle financiero de una coreografía. Prototipo descartable del ticket #585; los datos están en memoria y no se guarda nada."
      requireSelectedEvent={false}
    >
      <div className="flex flex-col gap-6 pb-40">
        <Alert>
          <AlertTitle>Prototipo, no funcionalidad</AlertTitle>
          <AlertDescription>
            Se está viendo la variante {variant} para{" "}
            {prototypeAudienceNames[audience].toLowerCase()}. Los botones de
            abajo mueven el elenco en <em>otras</em> coreografías: es la única
            forma de ver cómo se mueve esta factura.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Total"
            value={formatAmount(choreography.derivedTotal)}
          />
          <MetricCard title="Descuentos" value={formatAmount(discountAmount)} />
          <MetricCard
            title="Saldo adeudado"
            value={formatAmount(owedBalanceAmount)}
          />
          <MetricCard
            title="Facturado"
            value={
              choreography.documentedTotal === null
                ? "Sin factura"
                : formatAmount(choreography.documentedTotal)
            }
            slot={
              choreography.comprobante === null ? undefined : (
                <Badge variant="secondary">
                  {choreography.comprobante.label}
                </Badge>
              )
            }
          />
        </section>

        <RosterTable
          inscriptions={choreography.inscriptions}
          variant={variant}
          onFocusDancer={setHighlightedDancerId}
        />

        {variant === "C" ? (
          <p className="text-sm text-muted-foreground">
            En esta variante no hay sección: el detalle del descuento se abre
            desde la celda de la fila.
          </p>
        ) : (
          <DiscountSection
            choreography={choreography}
            variant={variant}
            audience={audience}
            highlightedDancerId={highlightedDancerId}
          />
        )}

        <PrototypeSwitcher
          variant={variant}
          audience={audience}
          onSelect={select}
          scenarios={[
            {
              label: "Emitir la factura",
              onRun: prototype.onEmit,
            },
            {
              label: "Inscribir a Ana en «Vértigo»",
              onRun: () =>
                prototype.onRegisterSibling("dan-ana", "cho-vertigo"),
            },
            {
              label: "Dar de baja a Bruno en «Vértigo»",
              onRun: () => prototype.onWithdrawSibling("ins-bruno-vertigo"),
            },
            {
              label: "Reinscribir a Emilia en «Ecos»",
              onRun: () =>
                prototype.onRegisterSibling("dan-emilia", "cho-ecos"),
            },
            {
              label: "Reiniciar",
              onRun: () => {
                setHighlightedDancerId(null);
                prototype.onReset();
              },
            },
          ]}
        />
      </div>
    </AdminResourceLayout>
  );
}
