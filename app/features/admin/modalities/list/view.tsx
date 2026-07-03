import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { buildCreatePath, buildDetailPath } from "@/lib/shared/navigation";

import {
  basePath,
  type AdministrativeEventModalitiesLoaderData,
  type EventModalityRow,
  type EventSubmodalityRow,
} from "../shared";

export type AdministrativeEventModalitiesListViewProps = {
  loaderData: AdministrativeEventModalitiesLoaderData;
};

export function AdministrativeEventModalitiesListView({
  loaderData,
}: AdministrativeEventModalitiesListViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Modalidades"
      description="Gestioná las modalidades y submodalidades del evento activo."
      action={{
        label: "Nueva modalidad",
        to: buildCreatePath(basePath, loaderData.selectedEventId, "nueva"),
      }}
    >
      {loaderData.modalities.length > 0 ? (
        <ModalitiesTable
          modalities={loaderData.modalities}
          submodalities={loaderData.submodalities}
          selectedEventId={loaderData.selectedEventId}
        />
      ) : (
        <AdminEmptyState
          title="Todavía no hay modalidades creadas."
          description="Creá la primera modalidad para organizar las coreografías del evento activo y agregar sus submodalidades desde el detalle."
        />
      )}
    </AdminResourceLayout>
  );
}

function groupSubmodalitiesByModalityId(submodalities: EventSubmodalityRow[]) {
  const submodalitiesByModalityId = new Map<string, EventSubmodalityRow[]>();

  for (const submodality of submodalities) {
    const groupedSubmodalities =
      submodalitiesByModalityId.get(submodality.modalityId) ?? [];

    groupedSubmodalities.push(submodality);
    submodalitiesByModalityId.set(submodality.modalityId, groupedSubmodalities);
  }

  return submodalitiesByModalityId;
}

function ModalitiesTable({
  modalities,
  selectedEventId,
  submodalities,
}: {
  modalities: EventModalityRow[];
  selectedEventId: string | null;
  submodalities: EventSubmodalityRow[];
}) {
  const submodalitiesByModalityId =
    groupSubmodalitiesByModalityId(submodalities);
  const columns: DataTableColumn<EventModalityRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (modality) => (
        <DataTableLink
          to={buildDetailPath(basePath, modality.id, selectedEventId)}
        >
          {modality.name}
        </DataTableLink>
      ),
      filterValue: (modality) => modality.name,
      sortValue: (modality) => modality.name,
    },
    {
      id: "submodalities",
      header: "Submodalidades",
      cell: (modality) => (
        <SubmodalityBadgeList
          submodalities={submodalitiesByModalityId.get(modality.id) ?? []}
        />
      ),
      filterValue: (modality) =>
        (submodalitiesByModalityId.get(modality.id) ?? [])
          .map((submodality) => submodality.name)
          .join(" "),
    },
  ];

  return (
    <ClientDataTable
      rows={modalities}
      columns={columns}
      getRowKey={(modality) => modality.id}
      searchPlaceholder="Buscar modalidad por nombre"
      textFilterColumnId="name"
      emptyMessage="No hay modalidades que coincidan con la búsqueda."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

function SubmodalityBadgeList({
  submodalities,
}: {
  submodalities: EventSubmodalityRow[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {submodalities.map((submodality) => (
        <Badge key={submodality.id} variant="secondary">
          {submodality.name}
        </Badge>
      ))}
    </div>
  );
}
