import { Building2 } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { academiesExportPath } from "@/features/admin/academies/export/shared";
import { PeriodExportMenu } from "@/features/admin/period-export/menu";
import { academyDataStatusLabels } from "@/lib/academies/academy-data-status";
import { describeEmptyList } from "@/lib/list-query/list-query";
import { AcademyDataStatusBadge } from "../data-status-badge";

import type { loadAcademiesList } from "./server";

const emptyAcademyList = describeEmptyList("academias", "search-and-filters");

type LoaderData = Awaited<ReturnType<typeof loadAcademiesList>>;
type AcademyRow = LoaderData["academies"][number];

type AcademiesListRouteViewProps = {
  loaderData: LoaderData;
};

const academyColumns: DataTableColumn<AcademyRow>[] = [
  {
    id: "name",
    header: "Nombre",
    className: "min-w-56 font-medium",
    cell: (academy) => (
      <DataTableLink to={`/administracion/academias/${academy.id}`}>
        {academy.name}
      </DataTableLink>
    ),
    filterValue: (academy) => academy.name,
    sortValue: (academy) => academy.name,
  },
  {
    id: "contact",
    header: "Contacto",
    className: "text-muted-foreground",
    cell: (academy) => academy.contactName,
    filterValue: (academy) => academy.contactName,
  },
  {
    id: "status",
    header: "Estado",
    cell: (academy) =>
      academy.isParticipating ? (
        <Badge variant="success">Participando</Badge>
      ) : (
        <Badge variant="secondary">No participando</Badge>
      ),
    filterValue: (academy) =>
      academy.isParticipating ? "Participando" : "No participando",
  },
  {
    id: "data",
    header: "Datos",
    cell: (academy) => <AcademyDataStatusBadge status={academy.dataStatus} />,
    filterValue: (academy) => academyDataStatusLabels[academy.dataStatus],
  },
  {
    id: "filters",
    header: "Filtros",
    hidden: true,
    cell: () => null,
    // What the faceted filters match: one value per group.
    filterValues: (academy) => [
      academy.isParticipating ? "si" : "no",
      academy.dataStatus === "complete" ? "completa" : "incompleta",
    ],
  },
];

export const academyFacetedFilterIds = ["participando", "datos"] as const;

const academyFacetedFilters: DataTableFacetedFiltersOf<
  typeof academyFacetedFilterIds
> = [
  {
    id: "participando",
    label: "Participación",
    options: [
      { label: "Participando", value: "si" },
      { label: "No participando", value: "no" },
    ],
    renderValue: (option) => (
      <Badge variant={option.value === "si" ? "success" : "secondary"}>
        {option.label}
      </Badge>
    ),
  },
  {
    id: "datos",
    label: "Datos",
    options: [
      { label: academyDataStatusLabels.complete, value: "completa" },
      { label: academyDataStatusLabels.incomplete, value: "incompleta" },
    ],
    renderValue: (option) => (
      <AcademyDataStatusBadge
        status={option.value === "completa" ? "complete" : "incomplete"}
      />
    ),
  },
];

export function AcademiesListRouteView({
  loaderData,
}: AcademiesListRouteViewProps) {
  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      selectedEventId={loaderData.selectedEventId}
      title="Academias"
      description="Consultá las academias registradas y, si hay evento activo, su participación."
      headerAction={
        !loaderData.canWrite && loaderData.selectedEventId !== null ? (
          <PeriodExportMenu
            description="Las academias con inscripciones registradas en el período, en el evento activo. Dejá una fecha vacía para no acotar ese extremo."
            path={academiesExportPath}
            title="Exportar academias"
          />
        ) : undefined
      }
    >
      {loaderData.academies.length > 0 ? (
        <ClientDataTable
          rows={loaderData.academies}
          columns={academyColumns}
          facetedFilters={academyFacetedFilters}
          getRowKey={(academy) => academy.id}
          searchPlaceholder="Buscar por nombre o contacto"
          emptyMessage={emptyAcademyList.nothingMatched}
        />
      ) : (
        <AdminEmptyState
          icon={Building2}
          title={emptyAcademyList.nothingYet}
          description="Cuando exista al menos una academia, va a aparecer en este listado."
        />
      )}
    </AdminResourceLayout>
  );
}
