import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import type { DancerInscription } from "@/lib/dancers/inscriptions";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import type { RosterChoreography } from "@/lib/roster/inscriptions";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/**
 * The inscriptions a dancer holds in the active event. Administration and the
 * academy portal read the same columns; each passes the choreography detail it
 * can reach. The figures are the finance read model's, so `Total` is what the
 * inscription must pay, not an estimate — or, on a withdrawn row, what remains
 * allocated to it.
 */
export function DancerInscriptionsTable({
  buildChoreographyHref,
  inscriptions,
}: {
  buildChoreographyHref: (choreographyId: string) => string;
  inscriptions: DancerInscription[];
}) {
  const columns: DataTableColumn<DancerInscription>[] = [
    ...buildChoreographyColumns<DancerInscription>(buildChoreographyHref),
    {
      id: "basePriceAmount",
      header: "Precio base",
      cell: (inscription) =>
        formatInscriptionMoney(inscription.basePriceAmount),
    },
    {
      id: "dancerDiscountAmount",
      header: "Descuento",
      cell: (inscription) =>
        formatInscriptionMoney(inscription.dancerDiscountAmount),
    },
    {
      id: "totalAmount",
      header: "Total",
      cell: (inscription) => formatInscriptionMoney(inscription.totalAmount),
    },
  ];

  return (
    <ClientDataTable
      rows={inscriptions}
      columns={columns}
      getRowKey={(inscription) => inscription.id}
      searchPlaceholder="Buscar inscripción por coreografía o evento"
      emptyMessage="Este bailarín no tiene inscripciones en el evento activo."
      initialSort={{ columnId: "choreographyName", direction: "asc" }}
    />
  );
}

/**
 * The choreographies a professor is linked to in the active event: the
 * dancer's columns without the money, because a professor's link is not
 * charged.
 */
export function ProfessorChoreographiesTable({
  buildChoreographyHref,
  choreographies,
}: {
  buildChoreographyHref: (choreographyId: string) => string;
  choreographies: RosterChoreography[];
}) {
  return (
    <ClientDataTable
      rows={choreographies}
      columns={buildChoreographyColumns<RosterChoreography>(
        buildChoreographyHref,
      )}
      getRowKey={(choreography) => choreography.id}
      searchPlaceholder="Buscar inscripción por coreografía o evento"
      emptyMessage="Este profesor no tiene inscripciones en el evento activo."
      initialSort={{ columnId: "choreographyName", direction: "asc" }}
    />
  );
}

function buildChoreographyColumns<TRow extends RosterChoreography>(
  buildChoreographyHref: (choreographyId: string) => string,
): DataTableColumn<TRow>[] {
  return [
    {
      id: "choreographyNumber",
      header: "#",
      className: "tabular-nums",
      cell: (row) => formatEventSequenceNumber(row.choreographyNumber),
      sortValue: (row) => row.choreographyNumber,
    },
    {
      id: "choreographyName",
      header: "Coreografía",
      className: "font-medium",
      cell: (row) => (
        <DataTableLink to={buildChoreographyHref(row.id)}>
          {row.choreographyName}
        </DataTableLink>
      ),
      filterValue: (row) => row.choreographyName,
      sortValue: (row) => row.choreographyName,
    },
    {
      id: "eventName",
      header: "Evento",
      className: "text-muted-foreground",
      cell: (row) => row.eventName,
      filterValue: (row) => row.eventName,
      sortValue: (row) => row.eventName,
    },
    {
      id: "category",
      header: "Categoría / Tipo de grupo",
      className: "text-muted-foreground",
      cell: (row) =>
        formatPrimaryAndSecondaryValue(
          row.categoryName,
          formatGroupTypeLabel(row.groupType),
        ),
    },
  ];
}

/** An inscription's money, or `Sin precio` when no row prices it. */
export function formatInscriptionMoney(amount: number | null) {
  if (amount === null) {
    return "Sin precio";
  }

  return moneyFormatter.format(amount);
}
