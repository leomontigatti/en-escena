import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { buildScheduleDetailPath } from "@/lib/admin/events/event-bases-navigation";
import type { ScheduleListItem } from "@/lib/events/bases.server";

import { ResourceBadge } from "./dialogs";
import {
  buildScheduleFacetedFilters,
  formatDate,
  formatScheduleOccupancy,
} from "./shared";

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
          to={buildScheduleDetailPath(schedule.id, selectedEventId)}
        >
          {schedule.name}
        </DataTableLink>
      ),
      filterValue: (schedule) => schedule.name,
    },
    {
      id: "modalities",
      header: "Modalidades",
      className: "min-w-64 lg:w-[31rem] lg:max-w-[31rem]",
      headerClassName: "min-w-64 lg:w-[31rem] lg:max-w-[31rem]",
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
      id: "occupancy",
      header: "Ocupación",
      cell: (schedule) => formatScheduleOccupancy(schedule),
      className: "font-medium",
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

function ScheduleModalityBadges({ schedule }: { schedule: ScheduleListItem }) {
  const compactHiddenModalitiesCount = schedule.modalities.length - 2;
  const largeHiddenModalitiesCount = schedule.modalities.length - 4;

  return (
    <div className="flex flex-wrap gap-2">
      {schedule.modalities.slice(0, 4).map((modality, index) => (
        <ResourceBadge
          key={modality.id}
          className={index >= 2 ? "hidden lg:inline-flex" : undefined}
        >
          {modality.name}
        </ResourceBadge>
      ))}
      {compactHiddenModalitiesCount > 0 ? (
        <ResourceBadge className="lg:hidden">
          {compactHiddenModalitiesCount}+
        </ResourceBadge>
      ) : null}
      {largeHiddenModalitiesCount > 0 ? (
        <ResourceBadge className="hidden lg:inline-flex">
          {largeHiddenModalitiesCount}+
        </ResourceBadge>
      ) : null}
    </div>
  );
}
