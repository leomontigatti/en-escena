import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { buildCreatePath } from "@/lib/shared/navigation";

import { SeminarList } from "../list-table";
import { basePath, type SeminarsListLoaderData } from "../shared";

export type SeminarsListViewProps = {
  loaderData: SeminarsListLoaderData;
};

export function SeminarsListView({ loaderData }: SeminarsListViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Seminarios"
      description="Consultá los seminarios del evento activo, con su instructor, fecha, hora y cupo."
      action={{
        label: "Nuevo seminario",
        to: buildCreatePath(basePath, loaderData.selectedEventId),
      }}
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para gestionar seminarios",
        description:
          "Activá un evento para crear seminarios y consultar los que ya ofrece.",
      }}
    >
      {loaderData.seminars.length > 0 ? (
        <SeminarList
          seminars={loaderData.seminars}
          selectedEventId={loaderData.selectedEventId}
        />
      ) : (
        <AdminEmptyState
          title="Todavía no hay seminarios creados."
          description="Creá el primer seminario para que las academias puedan inscribir a su elenco."
        />
      )}
    </AdminResourceLayout>
  );
}
