// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the seminar list.
import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import {
  formatAvailablePlacesSuffix,
  formatDate,
} from "@/features/admin/schedules/view-shared";
import { cn } from "@/lib/shared/utils";
import type { PrototypeSeminar } from "./seminar-money-fixtures.prototype";

/**
 * The list as it is today, with `Cupo` keeping its shape (the quota, then what
 * is left of it) and what is left now counting `quota − covered`. `Inscriptos`
 * beside it counts every non-withdrawn row — the second count the quota ticket
 * put on this list (#888).
 */
export function SeminarListPrototype({
  buildDetailHref,
  seminars,
}: {
  buildDetailHref: () => string;
  seminars: PrototypeSeminar[];
}) {
  const columns: DataTableColumn<PrototypeSeminar>[] = [
    {
      id: "instructorName",
      header: "Instructor",
      className: "min-w-56 font-medium",
      cell: (seminar) => (
        <DataTableLink to={buildDetailHref()}>
          {seminar.instructorName}
        </DataTableLink>
      ),
      filterValue: (seminar) => seminar.instructorName,
    },
    {
      id: "scheduledDate",
      header: "Fecha",
      cell: (seminar) => formatDate(seminar.scheduledDate),
      className: "text-muted-foreground",
      sortValue: (seminar) => `${seminar.scheduledDate} ${seminar.startTime}`,
    },
    {
      id: "startTime",
      header: "Hora",
      cell: (seminar) => seminar.startTime,
      className: "text-muted-foreground",
    },
    {
      id: "quota",
      header: "Cupo",
      className: "font-medium whitespace-nowrap",
      cell: (seminar) => {
        const availablePlaces = seminar.quota - seminar.coveredCount;

        return (
          <span>
            {seminar.quota}
            <span
              className={cn(
                "font-normal",
                availablePlaces === 0
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {formatAvailablePlacesSuffix(availablePlaces)}
            </span>
          </span>
        );
      },
    },
    {
      id: "registeredCount",
      header: "Inscriptos",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (seminar) => seminar.registeredCount,
      sortValue: (seminar) => seminar.registeredCount,
    },
  ];

  return (
    <AdminResourceLayout
      selectedEventId="evento-prototipo"
      title="Seminarios"
      description="Consultá los seminarios del evento activo, con su instructor, fecha, hora y cupo."
      action={{ label: "Nuevo seminario", to: "#prototipo" }}
    >
      <ClientDataTable
        rows={seminars}
        columns={columns}
        getRowKey={(seminar) => seminar.id}
        searchPlaceholder="Buscar seminario por instructor"
        textFilterColumnId="instructorName"
        emptyMessage="No hay seminarios que coincidan con la búsqueda."
        initialSort={{ columnId: "scheduledDate", direction: "asc" }}
      />
    </AdminResourceLayout>
  );
}
