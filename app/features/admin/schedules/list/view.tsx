import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { buildCreatePath } from "@/lib/shared/navigation";
import { describeEmptyList } from "@/lib/list-query/list-query";

import { ScheduleList } from "../list-table";
import { basePath, type EventSchedulesListLoaderData } from "../shared";

const emptyScheduleList = describeEmptyList(
  "cronogramas",
  "search-and-filters",
);

export type EventSchedulesListViewProps = {
  loaderData: EventSchedulesListLoaderData;
};

export function EventSchedulesListView({
  loaderData,
}: EventSchedulesListViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Cronogramas"
      description="Consultá capacidad, modalidades aceptadas y ocupación reservada por cupos de cronograma."
      action={{
        label: "Nuevo cronograma",
        to: buildCreatePath(basePath, loaderData.selectedEventId),
      }}
    >
      {loaderData.schedules.length > 0 ? (
        <ScheduleList
          schedules={loaderData.schedules}
          selectedEventId={loaderData.selectedEventId}
        />
      ) : (
        <AdminEmptyState
          title={emptyScheduleList.nothingYet}
          description="Creá el primer cronograma para definir cupo, hora y modalidades aceptadas del evento activo."
        />
      )}
    </AdminResourceLayout>
  );
}
