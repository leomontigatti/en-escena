import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import {
  formatAvailablePlacesSuffix,
  formatDate,
} from "@/features/admin/schedules/view-shared";
import type { SeminarListItem } from "@/lib/seminars/repository.server";
import { buildDetailPath } from "@/lib/shared/navigation";
import { cn } from "@/lib/shared/utils";

import { basePath } from "./shared";

export function SeminarList({
  seminars,
  selectedEventId,
}: {
  seminars: SeminarListItem[];
  selectedEventId: string | null;
}) {
  const columns: DataTableColumn<SeminarListItem>[] = [
    {
      id: "instructorName",
      header: "Instructor",
      className: "min-w-56 font-medium",
      cell: (seminar) => (
        <DataTableLink
          to={buildDetailPath(basePath, seminar.id, selectedEventId)}
        >
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
      sortValue: (seminar) => seminar.startTime,
    },
    {
      id: "quota",
      header: "Cupo",
      cell: (seminar) => (
        <SeminarQuota
          availablePlaces={seminar.availablePlaces}
          quota={seminar.quota}
        />
      ),
      className: "font-medium whitespace-nowrap",
    },
  ];

  return (
    <ClientDataTable
      rows={seminars}
      columns={columns}
      getRowKey={(seminar) => seminar.id}
      searchPlaceholder="Buscar seminario por instructor"
      textFilterColumnId="instructorName"
      emptyMessage="No hay seminarios que coincidan con la búsqueda."
      initialSort={{ columnId: "scheduledDate", direction: "asc" }}
    />
  );
}

/**
 * Same shape as the quota field in the form: the quota, then what is left of it
 * in muted read-only text. A full seminar reads destructive, so it is findable
 * while scanning the column.
 */
function SeminarQuota({
  availablePlaces,
  quota,
}: {
  availablePlaces: number;
  quota: number;
}) {
  return (
    <span>
      {quota}
      <span
        className={cn(
          "font-normal",
          availablePlaces === 0 ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {formatAvailablePlacesSuffix(availablePlaces)}
      </span>
    </span>
  );
}
