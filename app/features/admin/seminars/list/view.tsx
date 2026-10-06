import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { buildCreatePath } from "@/lib/shared/navigation";
import { describeEmptyList } from "@/lib/list-query/list-query";

import { SeminarExportMenu } from "../export/menu";
import { SeminarList } from "../list-table";
import { basePath, type SeminarsListLoaderData } from "../shared";

const emptySeminarList = describeEmptyList("seminarios", "search");

export type SeminarsListViewProps = {
  loaderData: SeminarsListLoaderData;
};

export function SeminarsListView({ loaderData }: SeminarsListViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Seminarios"
      description="Consultá los seminarios del evento activo, con su instructor, fecha, hora, cupo y tipo."
      action={
        loaderData.canWrite
          ? {
              label: "Nuevo seminario",
              to: buildCreatePath(basePath, loaderData.selectedEventId),
            }
          : undefined
      }
      headerAction={
        !loaderData.canWrite && loaderData.selectedEventId !== null ? (
          <SeminarExportMenu
            seminars={loaderData.seminars.filter(({ id }) =>
              loaderData.exportableSeminarIds.includes(id),
            )}
          />
        ) : undefined
      }
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para gestionar seminarios",
        description:
          "Activá un evento para crear seminarios y consultar los que ya ofrece.",
      }}
    >
      {loaderData.seminars.length > 0 ? (
        <SeminarList
          linksToDetail={loaderData.canWrite}
          seminars={loaderData.seminars}
          selectedEventId={loaderData.selectedEventId}
        />
      ) : (
        <AdminEmptyState
          title={emptySeminarList.nothingYet}
          description={
            loaderData.canWrite
              ? "Creá el primer seminario para que las academias puedan inscribir a su elenco."
              : "Cuando la administración cree seminarios vas a poder consultarlos desde este listado."
          }
        />
      )}
    </AdminResourceLayout>
  );
}
