import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { buildCreatePath } from "@/lib/shared/navigation";

import { ScheduleList } from "../list-table";
import { basePath, type EventSchedulesListLoaderData } from "../shared";

export type EventSchedulesListViewProps = {
  loaderData: EventSchedulesListLoaderData;
};

export function AdministrativeEventSchedulesListView({
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
          title="Todavía no hay cronogramas creados."
          description="Creá el primer cronograma para definir cupo, hora y modalidades aceptadas del evento activo."
        />
      )}
    </AdminResourceLayout>
  );
}
