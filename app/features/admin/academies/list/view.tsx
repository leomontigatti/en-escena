import { Building2 } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";

import type { loadAdministrativeAcademiesList } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadAdministrativeAcademiesList>>;
type AcademyRow = LoaderData["academies"][number];

type AdministracionAcademiasRouteViewProps = {
  loaderData: LoaderData;
};

const academyColumns: DataTableColumn<AcademyRow>[] = [
  {
    id: "name",
    header: "Nombre",
    className: "min-w-56 font-medium",
    cell: (academy) => academy.name,
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
    id: "filters",
    header: "Filtros",
    hidden: true,
    cell: () => null,
    filterValue: (academy) => (academy.isParticipating ? "si" : "no"),
  },
];

const academyFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "participando",
    label: "Participación",
    options: [
      { label: "Participando", value: "si" },
      { label: "No participando", value: "no" },
    ],
  },
];

export function AdministracionAcademiasRouteView({
  loaderData,
}: AdministracionAcademiasRouteViewProps) {
  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      selectedEventId={loaderData.selectedEventId}
      title="Academias"
      description="Consultá las academias registradas y, si hay evento activo, su participación."
    >
      {loaderData.academies.length > 0 ? (
        <ClientDataTable
          rows={loaderData.academies}
          columns={academyColumns}
          facetedFilters={academyFacetedFilters}
          getRowKey={(academy) => academy.id}
          searchPlaceholder="Buscar academia por nombre o contacto"
          emptyMessage="No hay academias que coincidan con la búsqueda."
        />
      ) : (
        <AdminEmptyState
          icon={Building2}
          title="Todavía no hay academias registradas."
          description="Cuando exista al menos una academia, va a aparecer en este listado."
        />
      )}
    </AdminResourceLayout>
  );
}
