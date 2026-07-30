/**
 * PROTOTIPO DESCARTABLE — ticket #550 del mapa #547. Vista 2 de 2.
 *
 * El detalle financiero de una coreografía
 * (`/administracion/finanzas/:academyId/coreografias/:choreographyId` en la app
 * real): sus inscripciones, lo asignado contra lo adeudado, y desde dónde se
 * asigna. Los presets de #551 son la acción principal en A y B; C los reemplaza
 * por montos escritos a mano para poder comparar los dos extremos.
 *
 * Tres variantes con `?variant=A|B|C`; la coreografía se elige con
 * `?coreografia=`.
 */
import { useSearchParams } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { PrototypeSwitcher } from "@/components/shared/prototype-switcher";
import { MetricCard } from "@/components/shared/metric-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { formatAmount } from "../formatters";
import { DetailVariantA } from "./detail-variant-a";
import { DetailVariantB } from "./detail-variant-b";
import { DetailVariantC } from "./detail-variant-c";
import { ChoreographyAnomalyBadges } from "./list-shared";
import { allocationDetailVariants } from "./shared";
import { StateReadout } from "./state-readout";
import { usePrototype } from "./store";

export function AllocationDetailPrototypeView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const variantKey = searchParams.get("variant") ?? "A";
  const prototype = usePrototype();

  const choreographyId =
    searchParams.get("coreografia") ?? prototype.choreographies[0].id;
  const choreography =
    prototype.choreographies.find((row) => row.id === choreographyId) ??
    prototype.choreographies[0];

  const variantProps = {
    state: prototype.state,
    choreography,
    inscriptions: choreography.inscriptions,
    payments: prototype.payments,
    selectedPaymentId: prototype.payments[0]?.id ?? null,
    onSelectPayment: (paymentId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("pago", paymentId);
      setSearchParams(next, { replace: true, preventScrollReset: true });
    },
    onSelectPrice: prototype.onSelectPrice,
    onAllocate: prototype.onAllocate,
    onApplyUpserts: prototype.onApplyUpserts,
  };

  // La variante C es la única que necesita saber qué pago está elegido, así que
  // el `?pago=` sólo se lee acá y no viaja por el contrato de las otras dos.
  const selectedPaymentId =
    searchParams.get("pago") ?? prototype.payments[0]?.id ?? null;

  return (
    <AdminResourceLayout
      title={`Prototipo · ${choreography.name}`}
      description="Detalle financiero de una coreografía. Prototipo descartable del ticket #550."
      requireSelectedEvent={false}
    >
      <div className="flex flex-col gap-6 pb-24">
        <Alert>
          <AlertTitle>Prototipo, no funcionalidad</AlertTitle>
          <AlertDescription>
            Vista 2 de 2: las inscripciones de una coreografía. Alterná
            variantes con la barra flotante o con las flechas del teclado.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap items-center gap-2">
          {prototype.choreographies.map((row) => (
            <Button
              key={row.id}
              type="button"
              size="sm"
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

        <ChoreographyAnomalyBadges anomalies={choreography.anomalies} />

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="Seña"
            value={formatAmount(choreography.depositAmount)}
          />
          <MetricCard
            title="Total"
            value={formatAmount(choreography.totalAmount)}
          />
          <MetricCard
            title="Adeudado"
            value={formatAmount(choreography.owedBalanceAmount)}
          />
        </section>

        {variantKey === "B" ? (
          <DetailVariantB {...variantProps} />
        ) : variantKey === "C" ? (
          <DetailVariantC
            {...variantProps}
            selectedPaymentId={selectedPaymentId}
          />
        ) : (
          <DetailVariantA {...variantProps} />
        )}

        <StateReadout />
      </div>

      <PrototypeSwitcher
        variants={allocationDetailVariants}
        current={variantKey}
      />
    </AdminResourceLayout>
  );
}
