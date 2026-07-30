/**
 * PROTOTIPO DESCARTABLE — ticket #550 del mapa #547.
 *
 * Tres variantes de la superficie de asignación, alternables con `?variant=A|B|C`
 * sobre esta ruta. Corre dentro del shell real de administración (sidebar,
 * topbar, breadcrumbs, densidad) para que las variantes se juzguen contra el
 * resto de la app, pero los datos son una fixture en memoria con la forma del
 * modelo nuevo: la forma de la tabla de asignaciones sigue abierta en #549, así
 * que el prototipo no toca el esquema real ni el servidor.
 *
 * Excepción declarada a las convenciones del repo: no hay tests, ni React Hook
 * Form, ni `action`, ni validación de servidor. Las mutaciones son `useState`.
 */
import { useState } from "react";
import { useSearchParams } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { PrototypeSwitcher } from "@/components/shared/prototype-switcher";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { formatAmount } from "../formatters";
import {
  initialPrototypeState,
  readInscriptions,
  readPayments,
  selectPrice,
  upsertAllocation,
} from "./fixtures";
import { allocationPrototypeVariants } from "./shared";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";

export function AllocationPrototypeRouteView() {
  const [searchParams] = useSearchParams();
  const variantKey = searchParams.get("variant") ?? "A";

  const [state, setState] = useState(initialPrototypeState);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    initialPrototypeState.payments[0].id,
  );

  const inscriptions = readInscriptions(state);
  const payments = readPayments(state);

  const variantProps = {
    state,
    inscriptions,
    payments,
    selectedPaymentId,
    onSelectPayment: setSelectedPaymentId,
    onSelectPrice: (inscriptionId: string, priceId: string | null) =>
      setState((current) => selectPrice(current, inscriptionId, priceId)),
    onAllocate: (paymentId: string, inscriptionId: string, amount: number) =>
      setState((current) =>
        paymentId === ""
          ? current
          : upsertAllocation(current, { paymentId, inscriptionId, amount }),
      ),
  };

  return (
    <AdminResourceLayout
      title="Prototipo · superficie de asignación"
      description="Prototipo descartable del ticket #550. Datos en memoria, nada se guarda."
      // La fixture no cuelga de ningún evento activo, así que el layout no puede
      // exigir uno: si no, muestra su estado vacío en lugar de las variantes.
      requireSelectedEvent={false}
    >
      <div className="flex flex-col gap-6 pb-24">
        <Alert>
          <AlertTitle>Prototipo, no funcionalidad</AlertTitle>
          <AlertDescription>
            Alterná las variantes con la barra flotante o con las flechas del
            teclado. Umbral de seña del evento:{" "}
            {state.requiredDepositPercentage}
            %.
          </AlertDescription>
        </Alert>

        {variantKey === "B" ? (
          <VariantB {...variantProps} />
        ) : variantKey === "C" ? (
          <VariantC {...variantProps} />
        ) : (
          <VariantA {...variantProps} />
        )}

        <StateReadout
          payments={payments}
          inscriptions={inscriptions}
          onReset={() => setState(initialPrototypeState)}
        />
      </div>

      <PrototypeSwitcher
        variants={allocationPrototypeVariants}
        current={variantKey}
      />
    </AdminResourceLayout>
  );
}

type StateReadoutProps = {
  payments: ReturnType<typeof readPayments>;
  inscriptions: ReturnType<typeof readInscriptions>;
  onReset: () => void;
};

/** El estado completo a la vista, para poder juzgar qué cambió cada acción. */
function StateReadout({ payments, inscriptions, onReset }: StateReadoutProps) {
  const allocated = inscriptions.reduce(
    (total, inscription) => total + inscription.allocatedAmount,
    0,
  );
  const owed = inscriptions.reduce(
    (total, inscription) => total + (inscription.owedAmount ?? 0),
    0,
  );

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Estado del prototipo
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          Reiniciar
        </Button>
      </div>
      <p className="text-sm tabular-nums">
        Asignado {formatAmount(allocated)} · adeudado {formatAmount(owed)} ·
        umbrales cruzados{" "}
        {inscriptions.filter((row) => row.thresholdCrossed).length} de{" "}
        {inscriptions.length} · saldadas{" "}
        {inscriptions.filter((row) => row.settled).length}
      </p>
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground tabular-nums">
        {payments.map((payment) => (
          <li key={payment.id}>
            Pago #{payment.number}: {formatAmount(payment.allocatedAmount)}{" "}
            asignado, {formatAmount(payment.availableAmount)} disponible
          </li>
        ))}
      </ul>
    </section>
  );
}
