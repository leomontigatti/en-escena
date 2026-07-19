/**
 * PROTOTIPO #339 — variantes del detalle financiero de una coreografía.
 *
 * Trigger de emisión FIJO en el menú de acciones del header (junto a Pagar
 * seña / Pagar saldo), decidido con administración. Las 3 variantes difieren en
 * cómo PRESENTAN el estado de facturación (facturada / desactualizada) y el
 * historial. El diálogo de emisión (preview + confirmación irreversible + UX de
 * error) y el de anulación con NC son compartidos. Throwaway.
 */

import {
  AlertTriangle,
  CircleDollarSign,
  FileText,
  Landmark,
  Receipt,
} from "lucide-react";
import { useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

import { AnularDialog } from "./anular-dialog";
import { ComprobanteMeta, type SharedProps } from "./detail-shared";
import { EmitDialog } from "./emit-dialog";
import { PrototypeSwitcher, useScenario, useVariant } from "./switcher";
import {
  buildDetailScenario,
  DesactualizadaBadge,
  EstadoBadge,
  formatAmount,
  formatComprobanteDate,
  formatComprobanteNumero,
  porcionLabel,
  TipoBadge,
  type PortionKey,
  type PortionState,
  type StubComprobante,
} from "./stub";

const CHOREO = "Fuego — Jazz Juvenil";
const ACADEMY = "Estudio Danza Norte";

// --- Owner de estado --------------------------------------------------------

export function DetailPrototype() {
  const variant = useVariant();
  const scenario = useScenario();
  // Re-seed cuando cambia el escenario (key fuerza remount).
  return <DetailPrototypeInner key={scenario} variant={variant} />;
}

function DetailPrototypeInner({ variant }: { variant: "A" | "B" | "C" }) {
  const scenario = useScenario();
  const seed = buildDetailScenario(scenario);
  const [portions, setPortions] = useState<PortionState[]>(seed.portions);
  const [comprobantes, setComprobantes] = useState<StubComprobante[]>(
    seed.comprobantes,
  );

  function emit(porcion: PortionKey) {
    const p = portions.find((x) => x.key === porcion);
    const monto = p && "montoDerivado" in p ? p.montoDerivado : 0;
    const nuevo: StubComprobante = {
      id: crypto.randomUUID(),
      tipoComprobante: "factura",
      cbteTipoCodigo: 11,
      porcion,
      choreographyName: CHOREO,
      academyName: ACADEMY,
      ptoVta: 5,
      cbteNro: 129 + comprobantes.length,
      cae:
        "751" +
        Math.floor(Math.random() * 1e11)
          .toString()
          .padStart(11, "0"),
      caeVto: "2026-08-10",
      fechaEmision: "2026-07-18",
      impTotalSnapshot: monto,
      estado: "vigente",
    };
    setComprobantes((c) => [...c, nuevo]);
    setPortions((prev) =>
      prev.map((x) => {
        if (x.key === porcion) {
          return {
            key: porcion,
            kind: "facturada",
            comprobante: nuevo,
            montoDerivado: monto,
            desactualizada: false,
          };
        }
        // matriz anti-doble-cobro: al facturar una porción, el resto se bloquea.
        if (x.kind === "facturable") {
          return {
            key: x.key,
            kind: "bloqueada",
            motivo: `${porcionLabel(porcion)} ya tiene comprobante vigente.`,
          };
        }
        return x;
      }),
    );
  }

  function anular(comprobanteId: string) {
    const original = comprobantes.find((c) => c.id === comprobanteId);
    if (!original) return;
    const nc: StubComprobante = {
      ...original,
      id: crypto.randomUUID(),
      tipoComprobante: "nota-credito",
      cbteTipoCodigo: 13,
      cbteNro:
        3 +
        comprobantes.filter((c) => c.tipoComprobante === "nota-credito").length,
      cae:
        "759" +
        Math.floor(Math.random() * 1e11)
          .toString()
          .padStart(11, "0"),
      fechaEmision: "2026-07-18",
      estado: "vigente",
      relacionadoId: original.id,
    };
    setComprobantes((c) =>
      c
        .map((x) =>
          x.id === comprobanteId ? { ...x, estado: "anulada" as const } : x,
        )
        .concat(nc),
    );
    // Anular libera la porción; con nada vigente, todo vuelve a ser facturable.
    setPortions((prev) =>
      prev.map((x) => ({
        key: x.key,
        kind: "facturable",
        montoDerivado:
          "montoDerivado" in x
            ? x.montoDerivado
            : x.key === "seña"
              ? 42000
              : x.key === "saldo"
                ? 98000
                : 140000,
      })),
    );
  }

  const shared = { portions, comprobantes, onEmit: emit, onAnular: anular };

  return (
    <AdminResourceLayout
      selectedEventId="proto"
      title="Detalle financiero"
      description="Revisá los importes, datos y comprobantes vinculados a esta coreografía."
      headerAction={<HeaderActions portions={portions} onEmit={emit} />}
    >
      <div className="flex flex-col gap-6">
        <ContextHeader />
        {variant === "A" && <VariantA {...shared} />}
        {variant === "B" && <VariantB {...shared} />}
        {variant === "C" && <VariantC {...shared} />}
      </div>
      <PrototypeSwitcher labels={DETAIL_LABELS} showScenario />
    </AdminResourceLayout>
  );
}

export const DETAIL_LABELS = {
  A: "Panel ARCA dedicado",
  B: "Anotado en las métricas",
  C: "Historial de comprobantes",
} as const;

function ContextHeader() {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-lg font-semibold">{CHOREO}</h2>
      <p className="text-sm text-muted-foreground">
        {ACADEMY} · Receptor: Consumidor final (anónimo)
      </p>
    </div>
  );
}

// --- Trigger en el header (compartido) --------------------------------------

function HeaderActions({
  portions,
  onEmit,
}: {
  portions: PortionState[];
  onEmit: (p: PortionKey) => void;
}) {
  const [emitOpen, setEmitOpen] = useState(false);
  return (
    <>
      <ResourceActionsMenu contentClassName="w-56">
        <DropdownMenuItem disabled>Pagar seña</DropdownMenuItem>
        <DropdownMenuItem disabled>Pagar saldo</DropdownMenuItem>
        <Separator className="my-1" />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setEmitOpen(true);
          }}
        >
          Emitir comprobante…
        </DropdownMenuItem>
      </ResourceActionsMenu>
      <EmitDialog
        portions={portions}
        open={emitOpen}
        onOpenChange={setEmitOpen}
        onEmit={onEmit}
      />
    </>
  );
}

// =============================================================================
// VARIANTE A — Panel ARCA dedicado
// =============================================================================

function VariantA({ portions, onAnular }: SharedProps) {
  return (
    <>
      <MetricsRow portions={portions} />
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" /> Comprobantes ARCA
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Solo visible para administración
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {portions.map((p) => (
            <PortionPanelRow key={p.key} portion={p} onAnular={onAnular} />
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function PortionPanelRow({
  portion,
  onAnular,
}: {
  portion: PortionState;
  onAnular: (id: string) => void;
}) {
  const [anularOpen, setAnularOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-medium">
          {porcionLabel(portion.key)}
          {portion.kind === "facturada" ? (
            <EstadoBadge estado={portion.comprobante.estado} />
          ) : null}
          {portion.kind === "facturada" && portion.desactualizada ? (
            <DesactualizadaBadge />
          ) : null}
        </span>
        <span className="tabular-nums text-sm">
          {"montoDerivado" in portion
            ? formatAmount(portion.montoDerivado)
            : null}
        </span>
      </div>

      {portion.kind === "facturable" ? (
        <p className="text-xs text-muted-foreground">
          Sin facturar. Emitila desde el menú de acciones del header.
        </p>
      ) : portion.kind === "bloqueada" ? (
        <p className="text-xs text-muted-foreground">{portion.motivo}</p>
      ) : portion.kind === "facturada" ? (
        <div className="flex items-end justify-between gap-3">
          <ComprobanteMeta c={portion.comprobante} />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm">
              Ver / imprimir
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAnularOpen(true)}
            >
              Anular con NC
            </Button>
          </div>
        </div>
      ) : null}

      {portion.kind === "facturada" && portion.desactualizada ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            El importe facturado (
            {formatAmount(portion.comprobante.impTotalSnapshot)}) ya no coincide
            con el importe derivado actual (
            {formatAmount(portion.montoDerivado)}): el roster cambió después de
            emitir. Anulá con NC y volvé a facturar si querés reflejar el nuevo
            importe.
          </AlertDescription>
        </Alert>
      ) : null}

      {portion.kind === "facturada" ? (
        <AnularDialog
          comprobante={portion.comprobante}
          open={anularOpen}
          onOpenChange={setAnularOpen}
          onAnular={onAnular}
        />
      ) : null}
    </div>
  );
}

// =============================================================================
// VARIANTE B — Anotado sobre las MetricCards
// =============================================================================

function VariantB({ portions, onAnular }: SharedProps) {
  const byKey = (k: PortionKey) => portions.find((p) => p.key === k)!;
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <MetricWithComprobante
        icon={Receipt}
        title="Seña"
        portion={byKey("seña")}
        onAnular={onAnular}
      />
      <MetricWithComprobante
        icon={Landmark}
        title="Saldo"
        portion={byKey("saldo")}
        onAnular={onAnular}
      />
      <MetricWithComprobante
        icon={CircleDollarSign}
        title="Total"
        portion={byKey("total")}
        onAnular={onAnular}
      />
    </section>
  );
}

function MetricWithComprobante({
  icon: Icon,
  title,
  portion,
  onAnular,
}: {
  icon: typeof Receipt;
  title: string;
  portion: PortionState;
  onAnular: (id: string) => void;
}) {
  const [anularOpen, setAnularOpen] = useState(false);
  const monto = "montoDerivado" in portion ? portion.montoDerivado : null;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {monto !== null ? formatAmount(monto) : "—"}
        </p>
        <Separator />
        {portion.kind === "facturada" ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <EstadoBadge estado={portion.comprobante.estado} />
              {portion.desactualizada ? <DesactualizadaBadge /> : null}
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {formatComprobanteNumero(
                portion.comprobante.ptoVta,
                portion.comprobante.cbteNro,
              )}
            </span>
            {portion.desactualizada ? (
              <p className="text-xs text-warning">
                Facturado {formatAmount(portion.comprobante.impTotalSnapshot)} ·
                ahora {formatAmount(portion.montoDerivado)}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={() => setAnularOpen(true)}
            >
              Anular con NC
            </Button>
            <AnularDialog
              comprobante={portion.comprobante}
              open={anularOpen}
              onOpenChange={setAnularOpen}
              onAnular={onAnular}
            />
          </div>
        ) : portion.kind === "bloqueada" ? (
          <Badge variant="secondary" className="w-fit">
            Cubierta por otro comprobante
          </Badge>
        ) : (
          <Badge variant="outline" className="w-fit">
            Sin facturar
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// VARIANTE C — Historial de comprobantes (tabla / documento-céntrico)
// =============================================================================

function VariantC({ portions, comprobantes, onAnular }: SharedProps) {
  const [anularId, setAnularId] = useState<string | null>(null);
  const anularTarget = comprobantes.find((c) => c.id === anularId) ?? null;

  const columns: DataTableColumn<StubComprobante>[] = [
    {
      id: "numero",
      header: "Comprobante",
      className: "font-mono",
      cell: (c) => formatComprobanteNumero(c.ptoVta, c.cbteNro),
    },
    {
      id: "tipo",
      header: "Tipo",
      cell: (c) => <TipoBadge tipo={c.tipoComprobante} />,
    },
    { id: "porcion", header: "Porción", cell: (c) => porcionLabel(c.porcion) },
    {
      id: "fecha",
      header: "Fecha",
      cell: (c) => formatComprobanteDate(c.fechaEmision),
    },
    {
      id: "importe",
      header: "Importe",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (c) => formatAmount(c.impTotalSnapshot),
    },
    {
      id: "estado",
      header: "Estado",
      cell: (c) => <EstadoBadge estado={c.estado} />,
    },
    {
      id: "acciones",
      header: "",
      cell: (c) =>
        c.tipoComprobante === "factura" && c.estado === "vigente" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAnularId(c.id)}
          >
            Anular con NC
          </Button>
        ) : null,
    },
  ];

  const desactualizada = portions.find(
    (p): p is Extract<PortionState, { kind: "facturada" }> =>
      p.kind === "facturada" && p.desactualizada,
  );

  return (
    <>
      <MetricsRow portions={portions} />
      {desactualizada ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Un comprobante quedó desactualizado</AlertTitle>
          <AlertDescription>
            {formatComprobanteNumero(
              desactualizada.comprobante.ptoVta,
              desactualizada.comprobante.cbteNro,
            )}{" "}
            facturó {formatAmount(desactualizada.comprobante.impTotalSnapshot)}{" "}
            pero el importe derivado hoy es{" "}
            {formatAmount(desactualizada.montoDerivado)} (cambió el roster).
            Anulá con NC para regularizar.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de comprobantes</CardTitle>
        </CardHeader>
        <CardContent>
          {comprobantes.length > 0 ? (
            <ClientDataTable<StubComprobante>
              rows={comprobantes}
              columns={columns}
              getRowKey={(c) => c.id}
              searchPlaceholder="Buscar comprobante"
              hideSearch
              hidePagination
              emptyMessage="Sin comprobantes."
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Esta coreografía todavía no tiene comprobantes emitidos.
            </p>
          )}
        </CardContent>
      </Card>
      {anularTarget ? (
        <AnularDialog
          comprobante={anularTarget}
          open={anularId !== null}
          onOpenChange={(o) => !o && setAnularId(null)}
          onAnular={onAnular}
        />
      ) : null}
    </>
  );
}

// --- Métricas base (compartidas por A y C) ----------------------------------

function MetricsRow({ portions }: { portions: PortionState[] }) {
  const monto = (k: PortionKey) => {
    const p = portions.find((x) => x.key === k);
    return p && "montoDerivado" in p ? formatAmount(p.montoDerivado) : "—";
  };
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <MetricCard icon={Receipt} title="Seña" value={monto("seña")} />
      <MetricCard icon={Landmark} title="Saldo" value={monto("saldo")} />
      <MetricCard
        icon={CircleDollarSign}
        title="Total"
        value={monto("total")}
      />
    </section>
  );
}
