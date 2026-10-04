import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { FoldedBadgesList } from "@/components/shared/badges-list";
import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { noOfferedSheets } from "@/lib/judging/sheet-criteria";
import { buildCreatePath, buildDetailPath } from "@/lib/shared/navigation";
import { describeEmptyList } from "@/lib/list-query/list-query";

import {
  modalityCriteriaStatus,
  type ModalityCriteriaStatus,
} from "../criteria-status";
import {
  basePath,
  type EventModalitiesLoaderData,
  type EventModalityRow,
  type EventSubmodalityRow,
} from "../shared";

const emptyModalityList = describeEmptyList("modalidades", "search");

export type EventModalitiesListViewProps = {
  loaderData: EventModalitiesLoaderData;
};

export function EventModalitiesListView({
  loaderData,
}: EventModalitiesListViewProps) {
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
        <ModalitiesTable loaderData={loaderData} />
      ) : (
        <AdminEmptyState
          title={emptyModalityList.nothingYet}
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
  loaderData,
}: {
  loaderData: EventModalitiesLoaderData;
}) {
  const { modalities, selectedEventId, submodalities } = loaderData;
  const submodalitiesByModalityId =
    groupSubmodalitiesByModalityId(submodalities);
  const criteriaStatusOf = (modality: EventModalityRow) =>
    modalityCriteriaStatus({
      criteria: loaderData.submodalityCriteria,
      sheets: loaderData.modalitySheets[modality.id] ?? noOfferedSheets,
      submodalities: submodalitiesByModalityId.get(modality.id) ?? [],
    });
  const columns: DataTableColumn<EventModalityRow>[] = [
    {
      id: "name",
      header: "Nombre",
      width: 3,
      className: "font-medium",
      cell: (modality) => (
        <DataTableTruncatedText value={modality.name}>
          <DataTableLink
            to={buildDetailPath(basePath, modality.id, selectedEventId)}
          >
            {modality.name}
          </DataTableLink>
        </DataTableTruncatedText>
      ),
      filterValue: (modality) => modality.name,
      sortValue: (modality) => modality.name,
    },
    {
      id: "submodalities",
      header: "Submodalidades",
      width: 7,
      cell: (modality) => (
        <FoldedBadgesList
          labels={(submodalitiesByModalityId.get(modality.id) ?? []).map(
            (submodality) => submodality.name,
          )}
        />
      ),
      filterValue: (modality) =>
        (submodalitiesByModalityId.get(modality.id) ?? [])
          .map((submodality) => submodality.name)
          .join(" "),
    },
    {
      id: "criteria",
      header: "Criterios",
      width: 2,
      cell: (modality) => (
        <CriteriaStatusBadge status={criteriaStatusOf(modality)} />
      ),
      filterValue: (modality) =>
        criteriaStatusBadges[criteriaStatusOf(modality)].label,
    },
  ];

  return (
    <ClientDataTable
      rows={modalities}
      columns={columns}
      getRowKey={(modality) => modality.id}
      layout="fit"
      searchPlaceholder="Buscar por nombre"
      textFilterColumnId="name"
      emptyMessage={emptyModalityList.nothingMatched}
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

const criteriaStatusBadges = {
  complete: { label: "Completos", variant: "success" },
  incomplete: { label: "Incompleto", variant: "warning" },
  none: { label: "Sin criterios", variant: "secondary" },
} as const satisfies Record<
  ModalityCriteriaStatus,
  { label: string; variant: "success" | "warning" | "secondary" }
>;

function CriteriaStatusBadge({ status }: { status: ModalityCriteriaStatus }) {
  const { label, variant } = criteriaStatusBadges[status];

  return <Badge variant={variant}>{label}</Badge>;
}
