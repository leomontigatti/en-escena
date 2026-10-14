import type { ComponentProps } from "react";

import { PortalListPageActions } from "@/components/portal/list-page-actions";
import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import {
  documentTypeEmptyLabel,
  formatIdentityDocument,
} from "@/lib/roster/identity-document";
import { matchesRosterPersonSearch } from "@/lib/roster/roster-person-search";
import {
  getParticipationBadgeVariant,
  getParticipationLabel,
} from "@/lib/participation/participation.shared";
import {
  defaultRosterPersonStatusFilter,
  getRosterPersonStatusBadgeVariant,
  getRosterPersonStatusLabel,
  toRosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";
import { type PortalProfessorsListLoaderData } from "@/features/portal/professors/list/shared";

type LoaderData = PortalProfessorsListLoaderData;
type ProfessorRow = LoaderData["professors"][number];
type ProfessorBadge = {
  label: string;
  variant: ComponentProps<typeof Badge>["variant"];
};

const professorDocumentKinds = ["professor_contract"] as const;

const baseProfessorFilters = {
  filters: {
    archivo: defaultRosterPersonStatusFilter,
  },
};

export const portalProfessorFacetedFilterIds = [
  "participacion",
  "completitud",
  "archivo",
] as const;

const professorFacetedFilters: DataTableFacetedFiltersOf<
  typeof portalProfessorFacetedFilterIds
> = [
  {
    id: "participacion",
    label: "Participación",
    options: [
      { label: "Participando", value: "participating" },
      { label: "No participando", value: "not-participating" },
    ],
    renderValue: (option) => (
      <Badge
        variant={getParticipationBadgeVariant(
          option.value === "participating"
            ? "participating"
            : "not-participating",
        )}
      >
        {option.label}
      </Badge>
    ),
  },
  {
    id: "completitud",
    label: "Completitud",
    options: [
      { label: "Completo", value: "complete" },
      { label: "Incompleto", value: "incomplete" },
    ],
    renderValue: (option) => (
      <Badge variant={option.value === "complete" ? "success" : "warning"}>
        {option.label}
      </Badge>
    ),
  },
  {
    id: "archivo",
    label: "Estado de alta",
    options: [
      {
        label: getRosterPersonStatusLabel("archived"),
        value: "archived",
      },
    ],
    renderValue: (option) => (
      <Badge variant={getRosterPersonStatusBadgeVariant("archived")}>
        {option.label}
      </Badge>
    ),
  },
];

export function PortalProfessorsListRouteView({
  loaderData,
}: {
  loaderData: LoaderData;
}) {
  return (
    <PortalListPage
      titleId="professors-title"
      title="Profesores"
      description="Gestioná los profesores de tu academia y completá su identificación cuando tengas los datos."
      action={
        <PortalListPageActions
          createLabel="Nuevo profesor"
          createTo="/portal/profesores/nuevo"
          documentDownloadUrls={loaderData.documentDownloadUrls}
          kinds={professorDocumentKinds}
        />
      }
    >
      {loaderData.professors.length > 0 ? (
        <ProfessorsTable professors={loaderData.professors} />
      ) : (
        <PortalEmptyState
          title="Todavía no cargaste profesores"
          description="Sumá el plantel docente de tu academia para empezar a vincularlo en las coreografías."
        />
      )}
    </PortalListPage>
  );
}

function ProfessorsTable({ professors }: { professors: ProfessorRow[] }) {
  const columns: DataTableColumn<ProfessorRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "w-1/2 font-medium",
      headerClassName: "w-1/2",
      cell: (professor) => (
        <DataTableLink recordTitle to={`/portal/profesores/${professor.id}`}>
          {professor.firstName} {professor.lastName}
        </DataTableLink>
      ),
      sortValue: (professor) => `${professor.firstName} ${professor.lastName}`,
    },
    {
      id: "document",
      header: "Documento",
      className: "w-1/4 text-muted-foreground",
      headerClassName: "w-1/4",
      cell: (professor) =>
        formatIdentityDocument(professor) ?? (
          <span className="text-muted-foreground">
            {documentTypeEmptyLabel}
          </span>
        ),
    },
    {
      id: "status",
      header: "Estado",
      className: "w-1/4",
      headerClassName: "w-1/4",
      cell: (professor) => (
        <div className="flex gap-2">
          {getProfessorStateBadges(professor).map((badge) => (
            <Badge key={badge.label} variant={badge.variant}>
              {badge.label}
            </Badge>
          ))}
        </div>
      ),
      filterValues: (professor) => [
        toRosterPersonStatus(professor.active),
        professor.participationStatus,
        professor.isIncomplete ? "incomplete" : "complete",
      ],
    },
  ];

  return (
    <ClientDataTable
      rows={professors}
      columns={columns}
      getRowKey={(professor) => professor.id}
      searchPlaceholder="Buscar por nombre o documento"
      matchesSearch={matchesRosterPersonSearch}
      facetedFilters={professorFacetedFilters}
      baseFacetedFilterValues={baseProfessorFilters}
      emptyMessage="No hay profesores que coincidan con la búsqueda o los filtros."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

function getProfessorStateBadges(professor: ProfessorRow) {
  const badges: ProfessorBadge[] = [];

  if (!professor.active) {
    badges.push({
      label: getRosterPersonStatusLabel("archived"),
      variant: getRosterPersonStatusBadgeVariant("archived"),
    });
  }

  if (professor.participationStatus !== "no-event") {
    badges.push({
      label: getParticipationLabel(professor.participationStatus),
      variant: getParticipationBadgeVariant(professor.participationStatus),
    });
  }

  badges.push(
    professor.isIncomplete
      ? { label: "Incompleto", variant: "warning" as const }
      : { label: "Completo", variant: "success" as const },
  );

  return badges;
}
