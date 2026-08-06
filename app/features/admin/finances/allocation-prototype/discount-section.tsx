/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547.
 *
 * The `Descuentos` section below the roster. The row's tooltip answers *how much*
 * — base price minus the percentage; this answers *why that percentage*, which is
 * a question the row cannot answer because the answer is in other choreographies.
 *
 * Two things it makes legible, both invisible today:
 *
 * 1. **Provenance.** The qualifying set is per academy and per event (#552), so
 *    the tier is earned by inscriptions this screen does not show, and the one
 *    left without a discount — the most expensive, ties broken by id — can be
 *    one of them too.
 * 2. **Movement.** The discount is always live, so an invoiced choreography's
 *    total moves when a sibling registers or withdraws. Under ADR-0009 there is
 *    nowhere to record *when* a percentage changed, so this is not history: it
 *    is the one comparison the model can honestly make, **what the factura says
 *    against what is derived now** (#599), and it exists only after emission.
 *
 * Every dancer of the roster is listed, not only the discounted ones: a `$ 0`
 * on a row identical to its neighbour's is exactly the number needing a cause.
 */
import { ClientDataTable } from "@/components/shared/client-data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { DataTableColumn } from "@/components/shared/data-table.shared";

import { formatAmount } from "../formatters";
import type { InscriptionReading } from "./fixtures";
import type { ChoreographyReading } from "./rollup";

export function DiscountSection({
  choreography,
}: {
  choreography: ChoreographyReading;
}) {
  const showsMovement = choreography.comprobante !== null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Descuentos</h2>
        <p className="text-sm text-muted-foreground">
          El descuento por bailarín se calcula sobre todas las inscripciones
          activas del bailarín en esta academia y este evento, no sólo sobre
          esta coreografía, y se recalcula cada vez que se lee.
        </p>
      </div>

      {showsMovement ? <MovementAlert choreography={choreography} /> : null}

      {/*
        A withdrawn row earns nothing and owes nothing: there is no percentage
        to explain, and where its money went is answered on the roster above.
      */}
      <ClientDataTable<InscriptionReading>
        rows={choreography.inscriptions.filter(
          (row) => row.withdrawnAt === null,
        )}
        columns={buildColumns(showsMovement)}
        getRowKey={(row) => row.id}
        initialSort={{ columnId: "dancer", direction: "asc" }}
        emptyMessage="No hay inscripciones para mostrar."
        searchPlaceholder="Buscar bailarín"
        hideSearch
        hidePagination
      />
    </section>
  );
}

/**
 * The delta lives here rather than only at the top of the screen because the
 * discount is what moved it: the alert names the document, and the row below
 * names the dancer whose tier changed.
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

  const amendments = choreography.comprobante?.amendments ?? [];

  if (choreography.delta === 0) {
    return (
      <Alert>
        <AlertTitle>Lo facturado coincide con lo derivado</AlertTitle>
        <AlertDescription>
          {[choreography.comprobante?.label, ...amendments.map((a) => a.label)]
            .filter(Boolean)
            .join(" · ")}
          {amendments.length === 0
            ? " · no se movió nada desde la emisión."
            : ""}
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
          {formatAmount(choreography.totalAmount)}:{" "}
          {formatAmount(Math.abs(choreography.delta))} de diferencia
          {moved.length > 0
            ? ` por el descuento de ${moved.map((row) => row.dancerName).join(", ")}.`
            : " por un cambio en el elenco."}{" "}
          Se emite desde el menú de acciones.
        </span>
      </AlertDescription>
    </Alert>
  );
}

function buildColumns(
  showsMovement: boolean,
): DataTableColumn<InscriptionReading>[] {
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
          {row.provenance.percentage} %
        </Badge>
      ),
      sortValue: (row) => row.provenance.percentage,
    },
    {
      id: "qualifying",
      header: "Inscripciones que lo habilitan",
      className: "min-w-64",
      cell: (row) => <QualifyingCell inscription={row} />,
    },
    {
      id: "reason",
      header: "Por qué",
      className: "min-w-64 text-muted-foreground",
      cell: (row) => readProvenanceSummary(row),
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
      cell: (row) => <MovementCell inscription={row} />,
    },
  ];
}

/** The one sentence that has to answer «¿por qué este número?». */
function readProvenanceSummary(inscription: InscriptionReading) {
  const { qualifyingCount, percentage, reason, excludedChoreographyName } =
    inscription.provenance;
  const inscriptions =
    qualifyingCount === 1
      ? "1 inscripción"
      : `${qualifyingCount} inscripciones`;

  if (reason === "belowTier") {
    return `${inscriptions} en el evento: hacen falta 3 para el 10 %.`;
  }

  // How a tie between identical prices is settled is deliberately not said: the
  // identifier decides, which is true and useless — the amount is the same
  // whichever row wins, so naming it only makes a settled number look arbitrary.
  if (reason === "excludedAsMostExpensive") {
    return `${inscriptions} en el evento, ${percentage} %. Ésta queda sin descuento por ser la más cara del bailarín.`;
  }

  return `${inscriptions} en el evento: ${percentage} %. Queda sin descuento «${excludedChoreographyName}», la más cara.`;
}

function QualifyingCell({ inscription }: { inscription: InscriptionReading }) {
  const { qualifying, withdrawn } = inscription.provenance;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {qualifying.map((row) => (
        <Badge
          key={row.inscriptionId}
          variant={
            row.isThisInscription
              ? "default"
              : row.isExcluded
                ? "warning"
                : "outline"
          }
        >
          {row.choreographyName}
          {row.isExcluded ? " · sin descuento" : ""}
          {row.isThisInscription ? " · ésta" : ""}
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

function MovementCell({ inscription }: { inscription: InscriptionReading }) {
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
      <Badge variant={delta > 0 ? "warning" : "info"}>
        {delta > 0 ? "Nota de débito" : "Nota de crédito"}
      </Badge>
    </div>
  );
}
