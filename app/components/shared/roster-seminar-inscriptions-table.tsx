import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { formatInscriptionMoney } from "@/components/shared/roster-inscriptions-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import type { RosterSeminarInscription } from "@/lib/roster/inscriptions";
import type { RosterPersonKind } from "@/lib/roster/roster-person-status.shared";
import { seminarKindLabels } from "@/lib/seminars/seminar-kinds";
import { formatDateOnlyAsDayMonthYear } from "@/lib/shared/date-only";

const emptyMessages: Record<RosterPersonKind, string> = {
  dancer: "Este bailarín no tiene seminarios en el evento activo.",
  professor: "Este profesor no tiene seminarios en el evento activo.",
};

/**
 * The seminar inscriptions a dancer or a professor holds in the active event,
 * withdrawn ones included. Administration and the academy
 * portal read the same columns, and each passes the seminar detail it can
 * reach. `Total` is the finance read model's: with no `Descuento por bailarín`
 * on a seminar it is what the inscription must pay, and on a withdrawn row what
 * remains allocated to it.
 */
export function RosterSeminarInscriptionsTable({
  buildSeminarHref,
  inscriptions,
  personKind,
}: {
  buildSeminarHref: (seminarId: string) => string;
  inscriptions: RosterSeminarInscription[];
  personKind: RosterPersonKind;
}) {
  const columns: DataTableColumn<RosterSeminarInscription>[] = [
    {
      id: "instructorName",
      header: "Instructor",
      className: "font-medium",
      cell: (inscription) => (
        <DataTableLink to={buildSeminarHref(inscription.seminarId)}>
          {inscription.instructorName}
        </DataTableLink>
      ),
      filterValue: (inscription) => inscription.instructorName,
      sortValue: (inscription) => inscription.instructorName,
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
      id: "scheduledDate",
      header: "Fecha",
      className: "text-muted-foreground tabular-nums",
      cell: (inscription) =>
        formatDateOnlyAsDayMonthYear(inscription.scheduledDate),
      sortValue: (inscription) =>
        `${inscription.scheduledDate} ${inscription.startTime}`,
    },
    {
      id: "startTime",
      header: "Hora",
      className: "text-muted-foreground tabular-nums",
      cell: (inscription) => inscription.startTime,
      sortValue: (inscription) => inscription.startTime,
    },
    {
      id: "kind",
      header: "Tipo",
      className: "text-muted-foreground",
      cell: (inscription) => seminarKindLabels[inscription.kind],
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
      searchPlaceholder="Buscar seminario por instructor o evento"
      emptyMessage={emptyMessages[personKind]}
      initialSort={{ columnId: "scheduledDate", direction: "asc" }}
    />
  );
}
