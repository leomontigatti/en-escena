/**
 * PROTOTIPO DESCARTABLE — ticket #550 del mapa #547. Vista 1 de 2.
 *
 * La lista financiera de coreografías de una academia
 * (`/administracion/finanzas/:academyId` en la app real), rehecha sobre el modelo
 * nuevo: figuras propias del alcance, estado como mínimo del rollup, anomalías
 * derivadas, y `Pagar seña` / `Pagar saldo` como **acciones de lista** (#551) en
 * lugar de acciones de instancia.
 *
 * Tres variantes con `?variant=A|B|C`. Excepción declarada a las convenciones del
 * repo: no hay tests de comportamiento, ni React Hook Form, ni `action`, ni
 * validación de servidor. Los datos son una fixture en memoria porque la forma de
 * la tabla sigue abierta en #549.
 */
import { Link, useSearchParams } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { PrototypeSwitcher } from "@/components/shared/prototype-switcher";
import { MetricCard } from "@/components/shared/metric-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { formatAmount } from "../formatters";
import { ListVariantA } from "./list-variant-a";
import { ListVariantB } from "./list-variant-b";
import { ListVariantC } from "./list-variant-c";
import { allocationListVariants } from "./shared";
import { StateReadout } from "./state-readout";
import { usePrototype } from "./store";

export function AllocationListPrototypeView() {
  const [searchParams] = useSearchParams();
  const variantKey = searchParams.get("variant") ?? "A";
  const prototype = usePrototype();

  const variantProps = {
    choreographies: prototype.choreographies,
    payments: prototype.payments,
    onApplyUpserts: prototype.onApplyUpserts,
  };

  return (
    <AdminResourceLayout
      title="Prototipo · lista financiera"
      description="Danza Viva — prototipo descartable del ticket #550. Datos en memoria, nada se guarda."
      requireSelectedEvent={false}
    >
      <div className="flex flex-col gap-6 pb-24">
        <Alert>
          <AlertTitle>Prototipo, no funcionalidad</AlertTitle>
          <AlertDescription>
            Vista 1 de 2: la lista de coreografías. Desde acá se llega al
            detalle de una coreografía. Alterná variantes con la barra flotante
            o con las flechas del teclado.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="Seña adeudada"
            value={formatAmount(prototype.academy.owedDepositAmount)}
          />
          <MetricCard
            title="Saldo disponible"
            value={formatAmount(prototype.academy.availableBalanceAmount)}
          />
          <MetricCard
            title="Saldo adeudado"
            value={formatAmount(prototype.academy.owedBalanceAmount)}
          />
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Ir al detalle de:
          </span>
          {prototype.choreographies.map((row) => (
            <Button key={row.id} asChild size="xs" variant="outline">
              <Link
                to={`/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=${row.id}&variant=${variantKey}`}
              >
                {row.name}
              </Link>
            </Button>
          ))}
        </div>

        {variantKey === "B" ? (
          <ListVariantB {...variantProps} />
        ) : variantKey === "C" ? (
          <ListVariantC {...variantProps} />
        ) : (
          <ListVariantA {...variantProps} />
        )}

        <StateReadout />
      </div>

      <PrototypeSwitcher
        variants={allocationListVariants}
        current={variantKey}
      />
    </AdminResourceLayout>
  );
}
