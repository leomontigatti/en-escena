import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { buildDetailPath } from "@/lib/shared/navigation";
import { cn } from "@/lib/shared/utils";
import type { ScheduleListItem } from "@/lib/events/bases.server";

import { ResourceBadge } from "./dialogs";
import { basePath } from "./shared";
import {
  buildScheduleFacetedFilters,
  formatAvailablePlacesSuffix,
  formatDate,
} from "./view-shared";

export function ScheduleList({
  schedules,
  selectedEventId,
}: {
  schedules: ScheduleListItem[];
  selectedEventId: string | null;
}) {
  const columns: DataTableColumn<ScheduleListItem>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (schedule) => (
        <DataTableLink
          to={buildDetailPath(basePath, schedule.id, selectedEventId)}
        >
          {schedule.name}
        </DataTableLink>
      ),
      filterValue: (schedule) => schedule.name,
    },
    {
      id: "modalities",
      header: "Modalidades",
      cell: (schedule) => <ScheduleModalityBadges schedule={schedule} />,
      filterValues: (schedule) =>
        schedule.modalities.map((modality) => modality.id),
      filterValue: (schedule) =>
        schedule.modalities.map((modality) => modality.name).join(" "),
    },
    {
      id: "scheduledDate",
      header: "Fecha",
      cell: (schedule) => formatDate(schedule.scheduledDate),
      className: "text-muted-foreground",
      sortValue: (schedule) =>
        `${schedule.scheduledDate} ${schedule.startTime}`,
    },
    {
      id: "startTime",
      header: "Hora",
      cell: (schedule) => schedule.startTime,
      className: "text-muted-foreground",
      sortValue: (schedule) => schedule.startTime,
    },
    {
      id: "capacity",
      header: "Cupo",
      cell: (schedule) => (
        <ScheduleCapacity
          availablePlaces={schedule.availablePlaces}
          capacity={schedule.totalCapacity}
        />
      ),
      className: "font-medium whitespace-nowrap",
    },
  ];

  return (
    <ClientDataTable
      rows={schedules}
      columns={columns}
      getRowKey={(schedule) => schedule.id}
      searchPlaceholder="Buscar cronograma por nombre"
      textFilterColumnId="name"
      facetedFilters={buildScheduleFacetedFilters(schedules)}
      emptyMessage="No hay cronogramas que coincidan con la búsqueda."
      initialSort={{ columnId: "scheduledDate", direction: "asc" }}
    />
  );
}

/**
 * Same shape as the capacity field in the form: the capacity, then what is left of
 * it in muted read-only text. A schedule with no room reads destructive, so
 * a full one is findable while scanning the column.
 */
function ScheduleCapacity({
  availablePlaces,
  capacity,
}: {
  availablePlaces: number;
  capacity: number;
}) {
  return (
    <span>
      {capacity}
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

/**
 * How many modalities a row spells out before it starts counting instead. Two
 * is what the column is worth: the badges say what kind of schedule this is,
 * which the first two already answer, and the rest is a number the reader
 * opens the schedule to expand. It used to be two here and four from `lg` up,
 * which made the column the widest on the page to hold a fourth badge most
 * rows did not have.
 */
const visibleModalityCount = 2;

function ScheduleModalityBadges({ schedule }: { schedule: ScheduleListItem }) {
  const hiddenModalities = schedule.modalities.slice(visibleModalityCount);

  return (
    <div className="flex items-center gap-2">
      {schedule.modalities.slice(0, visibleModalityCount).map((modality) => (
        <ResourceBadge key={modality.id}>{modality.name}</ResourceBadge>
      ))}
      {hiddenModalities.length > 0 ? (
        // The count is the only trace of the rest, so it carries their names:
        // the reader can tell what was folded away without opening the row.
        <ResourceBadge
          title={hiddenModalities.map((modality) => modality.name).join(", ")}
        >
          {hiddenModalities.length}+
        </ResourceBadge>
      ) : null}
    </div>
  );
}
