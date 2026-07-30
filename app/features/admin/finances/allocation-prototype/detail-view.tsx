/**
 * THROWAWAY PROTOTYPE — ticket #550 of map #547. View 2 of 2.
 *
 * A choreography's financial detail
 * (`/administracion/finanzas/:academyId/coreografias/:choreographyId` in the real
 * app): its inscriptions, allocated against owed, and where the money comes from.
 * #551's presets are the primary action in A and B; C replaces them with amounts
 * typed by hand, so the two extremes can be compared.
 *
 * Three variants under `?variant=A|B|C`; the choreography is chosen with
 * `?coreografia=`.
 */
import { useSearchParams } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { PrototypeSwitcher } from "@/components/shared/prototype-switcher";
import { MetricCard } from "@/components/shared/metric-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { formatAmount } from "../formatters";
import { repickPolicyLabels, type RepickPolicy } from "./allocation-rules";
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
    repickPolicy: prototype.repickPolicy,
    onSelectPayment: (paymentId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("pago", paymentId);
      setSearchParams(next, { replace: true, preventScrollReset: true });
    },
    onSelectPrice: prototype.onSelectPrice,
    onAllocate: prototype.onAllocate,
    onApplyUpserts: prototype.onApplyUpserts,
  };

  // Variant C is the only one that needs to know which payment is selected, so
  // `?pago=` is read only here and stays out of the other two's contract.
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

        <RepickPolicySwitch
          value={prototype.repickPolicy}
          onChange={prototype.onChangeRepickPolicy}
        />

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

/**
 * Cuts across the three variants instead of belonging to one: what a second
 * price pick does is a rule, so it has to be comparable with everything else
 * held still.
 */
function RepickPolicySwitch({
  value,
  onChange,
}: {
  value: RepickPolicy;
  onChange: (policy: RepickPolicy) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
      <span className="text-xs font-medium text-muted-foreground">
        Recambio de precio con plata asignada
      </span>
      {(Object.keys(repickPolicyLabels) as RepickPolicy[]).map((policy) => (
        <Button
          key={policy}
          type="button"
          size="xs"
          variant={policy === value ? "default" : "outline"}
          onClick={() => onChange(policy)}
        >
          {repickPolicyLabels[policy]}
        </Button>
      ))}
    </div>
  );
}
