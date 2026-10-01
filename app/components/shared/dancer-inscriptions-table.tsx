import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import type { DancerInscription } from "@/lib/dancers/inscriptions";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
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
 * inscription must pay, not an estimate.
 */
export function DancerInscriptionsTable({
  buildChoreographyHref,
  inscriptions,
}: {
  buildChoreographyHref: (choreographyId: string) => string;
  inscriptions: DancerInscription[];
}) {
  const columns: DataTableColumn<DancerInscription>[] = [
    {
      id: "choreographyNumber",
      header: "#",
      className: "font-medium tabular-nums",
      cell: (inscription) => (
        <DataTableLink to={buildChoreographyHref(inscription.id)}>
          {formatEventSequenceNumber(inscription.choreographyNumber)}
        </DataTableLink>
      ),
      sortValue: (inscription) => inscription.choreographyNumber,
    },
    {
      id: "choreographyName",
      header: "Coreografía",
      cell: (inscription) => inscription.choreographyName,
      filterValue: (inscription) => inscription.choreographyName,
      sortValue: (inscription) => inscription.choreographyName,
    },
    {
      id: "eventName",
      header: "Evento",
      className: "text-muted-foreground",
      cell: (inscription) => inscription.eventName,
      filterValue: (inscription) => inscription.eventName,
      sortValue: (inscription) => inscription.eventName,
    },
    {
      id: "category",
      header: "Categoría / Tipo de grupo",
      className: "text-muted-foreground",
      cell: (inscription) =>
        formatPrimaryAndSecondaryValue(
          inscription.categoryName,
          formatGroupTypeLabel(inscription.groupType),
        ),
    },
    {
      id: "basePriceAmount",
      header: "Precio base",
      cell: (inscription) => formatMoney(inscription.basePriceAmount),
    },
    {
      id: "dancerDiscountAmount",
      header: "Descuento",
      cell: (inscription) => formatMoney(inscription.dancerDiscountAmount),
    },
    {
      id: "totalAmount",
      header: "Total",
      cell: (inscription) => formatMoney(inscription.totalAmount),
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

function formatMoney(amount: number | null) {
  if (amount === null) {
    return "Sin precio";
  }

  return moneyFormatter.format(amount);
}
