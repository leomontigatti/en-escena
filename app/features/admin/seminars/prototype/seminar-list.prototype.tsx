// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the seminar list variants.
import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import {
  formatAvailablePlacesSuffix,
  formatDate,
} from "@/features/admin/schedules/view-shared";
import { cn } from "@/lib/shared/utils";
import { type PrototypeSeminar } from "./seminar-money-fixtures.prototype";

const selectedEventId = "evento-prototipo";

/**
 * A — `Cupo` keeps its current shape (the quota, then what is left of it) with
 * `quota − covered` behind it, and `Inscriptos` sits beside it as the count of
 * every non-withdrawn row.
 *
 * B — the occupancy is the headline: `Lugares` reads covered of quota, flagged
 * `Completo` when full, beside the same `Inscriptos`. Both variants keep the
 * two counts the quota ticket fixed and differ only in how places read.
 */
export function SeminarListPrototype({
  buildDetailHref,
  seminars,
  variant,
}: {
  buildDetailHref: () => string;
  seminars: PrototypeSeminar[];
  variant: string;
}) {
  const baseColumns: DataTableColumn<PrototypeSeminar>[] = [
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
  ];
  const registeredColumn: DataTableColumn<PrototypeSeminar> = {
    id: "registeredCount",
    header: "Inscriptos",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (seminar) => seminar.registeredCount,
    sortValue: (seminar) => seminar.registeredCount,
  };
  const variantColumns: DataTableColumn<PrototypeSeminar>[] =
    variant === "B"
      ? [
          {
            id: "places",
            header: "Lugares",
            className: "whitespace-nowrap",
            cell: (seminar) => (
              <span className="flex items-center gap-2">
                <span className="font-medium tabular-nums">
                  {seminar.coveredCount} de {seminar.quota}
                </span>
                {seminar.coveredCount >= seminar.quota ? (
                  <Badge variant="destructive">Completo</Badge>
                ) : null}
              </span>
            ),
            sortValue: (seminar) => seminar.quota - seminar.coveredCount,
          },
          registeredColumn,
        ]
      : [
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
          registeredColumn,
        ];

  return (
    <AdminResourceLayout
      selectedEventId={selectedEventId}
      title="Seminarios"
      description="Consultá los seminarios del evento activo, con su instructor, fecha, hora y cupo."
      action={{ label: "Nuevo seminario", to: "#prototipo" }}
    >
      <ClientDataTable
        rows={seminars}
        columns={[...baseColumns, ...variantColumns]}
        getRowKey={(seminar) => seminar.id}
        searchPlaceholder="Buscar seminario por instructor"
        textFilterColumnId="instructorName"
        emptyMessage="No hay seminarios que coincidan con la búsqueda."
        initialSort={{ columnId: "scheduledDate", direction: "asc" }}
      />
    </AdminResourceLayout>
  );
}
