/**
 * PROTOTIPO #339 — detalle financiero de una coreografía.
 *
 * Modelo de dos ejes: pago (seña → saldo, secuencial) y facturación (seña →
 * saldo, secuencial). Las acciones del header ("Pagar seña/saldo", "Facturar
 * seña/saldo") se derivan del estado. Cada MetricCard muestra su badge de
 * facturación (Vigente/Desactualizada/Anulada) y un link al comprobante cuando
 * la porción tiene uno. La anulación con NC vive en la pantalla de Comprobantes.
 * El diálogo de emisión (preview + confirmación irreversible + UX de error) es
 * compartido. Throwaway.
 */

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

import { EmitDialog, type EmitTarget } from "./emit-dialog";
import { ScenarioSwitcher, useScenario } from "./switcher";
import {
  availableActions,
  buildFactura,
  derivedMonto,
  DisplayEstadoBadge,
  formatAmount,
  seedDetail,
  SIN_FACTURAR,
  type DetailState,
  type PortionBilling,
  type PortionKey,
} from "./stub";

// --- Owner de estado --------------------------------------------------------

export function DetailPrototype() {
  const scenario = useScenario();
  // Re-seed cuando cambia el escenario (key fuerza remount).
  return <DetailPrototypeInner key={scenario} />;
}

function DetailPrototypeInner() {
  const scenario = useScenario();
  const [state, setState] = useState<DetailState>(() => seedDetail(scenario));

  function pagarSeña() {
    setState((s) => ({ ...s, señaPagada: true }));
  }

  function pagarSaldo() {
    setState((s) => ({ ...s, saldoPagado: true }));
  }

  function facturar(porcion: PortionKey) {
    if (porcion !== "seña" && porcion !== "saldo") return;
    setState((s) => {
      const existentes = [s.seña.comprobante, s.saldo.comprobante].filter(
        Boolean,
      ).length;
      const comprobante = buildFactura(porcion, 129 + existentes);
      return {
        ...s,
        [porcion]: { comprobante, estadoDisplay: "vigente" as const },
      };
    });
  }

  return (
    <AdminResourceLayout
      selectedEventId="proto"
      title="Detalle financiero"
      description="Revisá los importes, inscripciones y comprobantes relacionados a esta coreografía."
      headerAction={
        <HeaderActions
          state={state}
          onPagarSeña={pagarSeña}
          onPagarSaldo={pagarSaldo}
          onFacturar={facturar}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <MetricsBoard state={state} />
      </div>
      <ScenarioSwitcher />
    </AdminResourceLayout>
  );
}

// --- Acciones derivadas en el header ----------------------------------------

function HeaderActions({
  state,
  onPagarSeña,
  onPagarSaldo,
  onFacturar,
}: {
  state: DetailState;
  onPagarSeña: () => void;
  onPagarSaldo: () => void;
  onFacturar: (p: PortionKey) => void;
}) {
  const [target, setTarget] = useState<EmitTarget | null>(null);
  const actions = availableActions(state);
  const hasPago = actions.some(
    (a) => a === "pagar-seña" || a === "pagar-saldo",
  );
  const hasFactura = actions.some(
    (a) => a === "facturar-seña" || a === "facturar-saldo",
  );

  return (
    <>
      {actions.length > 0 ? (
        <ResourceActionsMenu contentClassName="w-56">
          {actions.includes("pagar-seña") ? (
            <DropdownMenuItem onSelect={onPagarSeña}>
              Pagar seña
            </DropdownMenuItem>
          ) : null}
          {actions.includes("pagar-saldo") ? (
            <DropdownMenuItem onSelect={onPagarSaldo}>
              Pagar saldo
            </DropdownMenuItem>
          ) : null}
          {hasPago && hasFactura ? <Separator className="my-1" /> : null}
          {actions.includes("facturar-seña") ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setTarget({ porcion: "seña", monto: derivedMonto.seña });
              }}
            >
              Facturar seña
            </DropdownMenuItem>
          ) : null}
          {actions.includes("facturar-saldo") ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setTarget({ porcion: "saldo", monto: derivedMonto.saldo });
              }}
            >
              Facturar saldo
            </DropdownMenuItem>
          ) : null}
        </ResourceActionsMenu>
      ) : null}
      <EmitDialog
        target={target}
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) setTarget(null);
        }}
        onEmit={(p) => {
          onFacturar(p);
          setTarget(null);
        }}
      />
    </>
  );
}

// --- MetricCards con la facturación anotada ---------------------------------

function MetricsBoard({ state }: { state: DetailState }) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <MetricPortionCard
        title="Seña"
        monto={derivedMonto.seña}
        billing={state.seña}
      />
      <MetricPortionCard
        title="Saldo"
        monto={derivedMonto.saldo}
        billing={state.saldo}
      />
      <MetricPortionCard
        title="Total"
        monto={derivedMonto.total}
        billing={SIN_FACTURAR}
      />
    </section>
  );
}

function MetricPortionCard({
  title,
  monto,
  billing,
}: {
  title: string;
  monto: number;
  billing: PortionBilling;
}) {
  const href = billing.comprobante
    ? `/administracion/comprobantes/${billing.comprobante.id}`
    : undefined;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {billing.estadoDisplay ? (
            <DisplayEstadoBadge estado={billing.estadoDisplay} />
          ) : null}
        </div>
        {href ? (
          <Button
            asChild
            variant="link"
            className="h-auto p-0 text-muted-foreground"
          >
            <Link
              to={href}
              aria-label={`Ver comprobante de ${title.toLowerCase()}`}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatAmount(monto)}
        </p>
      </CardContent>
    </Card>
  );
}
