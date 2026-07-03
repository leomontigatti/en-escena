import type {
  CategoriesListLoaderData,
  CategoryRow,
} from "@/features/admin/categories/shared";
import { basePath } from "@/features/admin/categories/shared";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { BadgesList } from "@/components/shared/badges-list";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import { groupTypeLabels, groupTypeOptions } from "@/lib/events/group-types";
import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { buildCreatePath, buildDetailPath } from "@/lib/shared/navigation";

type CategoriesListViewProps = {
  loaderData: CategoriesListLoaderData;
};

const categoryColumns: DataTableColumn<CategoryRow>[] = [
  {
    id: "name",
    header: "Nombre",
    className: "min-w-56 font-medium",
    cell: (category) => (
      <DataTableLink to={buildDetailPath(basePath, category.id, null)}>
        {category.name}
      </DataTableLink>
    ),
    filterValue: (category) => category.name,
  },
  {
    id: "ages",
    header: "Edades",
    className: "text-muted-foreground",
    cell: (category) => `${category.minAge} a ${category.maxAge} años`,
    filterValue: (category) => `${category.minAge} ${category.maxAge}`,
    sortValue: getCategoryAgeSortValue,
  },
  {
    id: "groupTypes",
    header: "Tipos de grupo",
    cell: (category) => (
      <BadgesList
        labels={category.groupTypes.map((groupType) =>
          formatGroupTypeLabel(groupType),
        )}
      />
    ),
    filterValues: (category) => category.groupTypes,
    filterValue: (category) =>
      category.groupTypes.map(formatGroupTypeLabel).join(" "),
  },
  {
    id: "experienceLevels",
    header: "Niveles",
    cell: (category) => (
      <BadgesList
        labels={category.experienceLevels.map(formatExperienceLevelLabel)}
      />
    ),
    filterValue: (category) =>
      category.experienceLevels.map(formatExperienceLevelLabel).join(" "),
  },
];

const categoryFacetedFilters: DataTableFacetedFilter[] = [
  {
    label: "Tipo de grupo",
    options: groupTypeOptions,
  },
];

function CategoriesListView({ loaderData }: CategoriesListViewProps) {
  const categories = loaderData.categories;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Categorías"
      description="Gestioná las categorías, tipos de grupo, modalidades y niveles de experiencia del evento activo."
      action={{
        label: "Nueva categoría",
        to: buildCreatePath(basePath, loaderData.selectedEventId, "nueva"),
      }}
    >
      {loaderData.categories.length > 0 ? (
        <ClientDataTable
          rows={categories}
          columns={categoryColumns}
          getRowKey={(category) => category.id}
          searchPlaceholder="Buscar categoría por nombre"
          textFilterColumnId="name"
          facetedFilters={categoryFacetedFilters}
          emptyMessage="No hay categorías que coincidan con la búsqueda."
          initialSort={{ columnId: "ages", direction: "asc" }}
        />
      ) : (
        <AdminEmptyState
          title="Todavía no hay categorías creadas."
          description="Creá la primera categoría para definir rangos de edad y aplicabilidad competitiva del evento activo."
        />
      )}
    </AdminResourceLayout>
  );
}

function getCategoryAgeSortValue(category: CategoryRow) {
  return [
    category.minAge.toString().padStart(3, "0"),
    category.maxAge.toString().padStart(3, "0"),
    category.name,
  ].join("-");
}

function formatExperienceLevelLabel(experienceLevelId: string) {
  return experienceLevelLabels[experienceLevelId] ?? experienceLevelId;
}

function formatGroupTypeLabel(groupType: string) {
  return groupTypeLabels[groupType] ?? groupType;
}

export { type CategoriesListViewProps, CategoriesListView };
