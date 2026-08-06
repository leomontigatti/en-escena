/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547.
 *
 * The `Descuentos` section below the roster, in the two shapes the ticket puts
 * against each other:
 *
 * - **A — composition only.** What the number *is*: the tier, the count that
 *   earned it, which inscriptions earned it and where they live, and which one
 *   is left without a discount. No history, which is the honest limit under
 *   ADR-0009: nothing records when a percentage changed.
 * - **B — composition and movement.** The same, plus the one comparison the
 *   model can actually make — **what the factura says against what is derived
 *   now**. It is not history: the comprobante is a persisted document, so the
 *   gap is a comparison of two current facts, and it exists only once something
 *   has been emitted.
 *
 * Every dancer of the roster is listed, not only the discounted ones: a `0 %` on
 * a row identical to its neighbour's is exactly the number that needs a cause.
 */
import { useEffect, useRef } from "react";

import { ClientDataTable } from "@/components/shared/client-data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { DataTableColumn } from "@/components/shared/data-table.shared";

import { formatAmount } from "../formatters";
import type { ChoreographyReading, InscriptionReading } from "./fixtures";
import {
  formatPercentage,
  readProvenanceSummary,
  type PrototypeAudienceKey,
  type PrototypeVariantKey,
} from "./shared";

export function DiscountSection({
  choreography,
  variant,
  audience,
  highlightedDancerId,
}: {
  choreography: ChoreographyReading;
  variant: PrototypeVariantKey;
  audience: PrototypeAudienceKey;
  highlightedDancerId: string | null;
}) {
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (highlightedDancerId !== null) {
      containerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [highlightedDancerId]);

  const showsMovement = variant === "B" && choreography.comprobante !== null;
  const rows = choreography.inscriptions.filter(
    (row) => row.withdrawnAt === null,
  );

  return (
    <section ref={containerRef} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Descuentos</h2>
        <p className="text-sm text-muted-foreground">
          El descuento por bailarín se calcula sobre todas las inscripciones
          activas del bailarín en esta academia y este evento, no sólo sobre
          esta coreografía. Se recalcula cada vez que se lee.
        </p>
      </div>

      {showsMovement ? <MovementAlert choreography={choreography} /> : null}

      {variant === "B" && choreography.comprobante === null ? (
        <p className="text-sm text-muted-foreground">
          Todavía no se emitió la factura de esta coreografía, así que no hay
          contra qué comparar: por ahora la sección sólo explica cómo se compone
          cada descuento.
        </p>
      ) : null}

      <ClientDataTable<InscriptionReading>
        rows={rows}
        columns={buildColumns({ showsMovement, audience })}
        getRowKey={(row) => row.id}
        getRowProps={(row) => ({
          className:
            row.dancerId === highlightedDancerId ? "bg-accent" : undefined,
        })}
        initialSort={{ columnId: "dancer", direction: "asc" }}
        emptyMessage="No hay inscripciones activas."
        searchPlaceholder="Buscar bailarín"
        hideSearch
        hidePagination
      />
    </section>
  );
}

/**
 * The choreography-level delta (#599), stated where the discount is explained
 * rather than only at the top of the screen: the alert names the document, this
 * says which dancers moved and why.
 */
function MovementAlert({
  choreography,
}: {
  choreography: ChoreographyReading;
}) {
  const moved = choreography.inscriptions.filter(
    (row) =>
      row.documentedAmount !== null && row.documentedAmount !== row.totalAmount,
  );

  if (choreography.delta === 0) {
    return (
      <Alert>
        <AlertTitle>La factura sigue coincidiendo con lo derivado</AlertTitle>
        <AlertDescription>
          {choreography.comprobante?.label} · nada se movió desde la emisión.
        </AlertDescription>
      </Alert>
    );
  }

  const isDebit = choreography.delta > 0;

  return (
    <Alert variant={isDebit ? "default" : "destructive"}>
      <AlertTitle>
        {isDebit
          ? "Falta emitir una nota de débito"
          : "Falta emitir una nota de crédito"}
      </AlertTitle>
      <AlertDescription>
        <span>
          {choreography.comprobante?.label} facturó{" "}
          {formatAmount(choreography.documentedTotal ?? 0)} y hoy corresponden{" "}
          {formatAmount(choreography.derivedTotal)}:{" "}
          {formatAmount(Math.abs(choreography.delta))} de diferencia
          {moved.length > 0
            ? ` por el descuento de ${moved
                .map((row) => row.dancerName)
                .join(", ")}.`
            : " por un cambio en el elenco."}
        </span>
      </AlertDescription>
    </Alert>
  );
}

function buildColumns({
  showsMovement,
  audience,
}: {
  showsMovement: boolean;
  audience: PrototypeAudienceKey;
}): DataTableColumn<InscriptionReading>[] {
  const columns: DataTableColumn<InscriptionReading>[] = [
    {
      id: "dancer",
      header: "Bailarín",
      className: "min-w-44 font-medium",
      cell: (row) => row.dancerName,
      sortValue: (row) => row.dancerName,
    },
    {
      id: "tier",
      header: "Nivel",
      cell: (row) => (
        <Badge variant={row.provenance.percentage > 0 ? "info" : "secondary"}>
          {formatPercentage(row.provenance.percentage)}
        </Badge>
      ),
      sortValue: (row) => row.provenance.percentage,
    },
    {
      id: "qualifying",
      header: "Inscripciones que lo habilitan",
      className: "min-w-96",
      cell: (row) => <QualifyingCell inscription={row} />,
    },
    {
      id: "reason",
      header: "Por qué",
      className: "min-w-72 text-muted-foreground",
      cell: (row) => readProvenanceSummary(row.provenance),
    },
    {
      id: "discountAmount",
      header: "Descuento",
      className: "text-right font-medium tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatAmount(row.discountAmount),
      sortValue: (row) => row.discountAmount,
    },
  ];

  if (!showsMovement) {
    return columns;
  }

  return [
    ...columns,
    {
      id: "documentedAmount",
      header: "Facturado",
      className: "text-right tabular-nums text-muted-foreground",
      headerClassName: "text-right",
      cell: (row) =>
        row.documentedAmount === null
          ? "Sin facturar"
          : formatAmount(row.documentedAmount),
    },
    {
      id: "movement",
      header: "Diferencia",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => <MovementCell inscription={row} audience={audience} />,
    },
  ];
}

function QualifyingCell({ inscription }: { inscription: InscriptionReading }) {
  const { qualifying, withdrawn } = inscription.provenance;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {qualifying.map((row) => (
        <Badge
          key={row.inscriptionId}
          variant={
            row.isFocusChoreography
              ? "default"
              : row.isExcluded
                ? "warning"
                : "outline"
          }
        >
          {row.choreographyName}
          {row.isExcluded ? " · sin descuento" : ""}
          {row.isFocusChoreography ? " · esta" : ""}
        </Badge>
      ))}
      {withdrawn.map((row) => (
        <Badge key={row.inscriptionId} variant="secondary">
          {row.choreographyName} · dada de baja
        </Badge>
      ))}
    </div>
  );
}

function MovementCell({
  inscription,
  audience,
}: {
  inscription: InscriptionReading;
  audience: PrototypeAudienceKey;
}) {
  if (inscription.documentedAmount === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  const delta = inscription.totalAmount - inscription.documentedAmount;

  if (delta === 0) {
    return <span className="text-muted-foreground">Sin cambios</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <span>{`${delta > 0 ? "+" : "−"}${formatAmount(Math.abs(delta))}`}</span>
      {/*
        The document is an admin task, not something the academy can resolve
        (#618, §6). In portal the movement is stated; the paperwork is not.
      */}
      {audience === "admin" ? (
        <Badge variant={delta > 0 ? "warning" : "info"}>
          {delta > 0 ? "Nota de débito" : "Nota de crédito"}
        </Badge>
      ) : null}
    </div>
  );
}
