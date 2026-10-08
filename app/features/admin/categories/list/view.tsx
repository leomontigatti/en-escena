import type {
  CategoriesListLoaderData,
  CategoryRow,
} from "@/features/admin/categories/shared";
import { basePath } from "@/features/admin/categories/shared";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { BadgesList } from "@/components/shared/badges-list";
import { Badge } from "@/components/ui/badge";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import { groupTypeLabels, groupTypeOptions } from "@/lib/events/group-types";
import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { buildCreatePath, buildDetailPath } from "@/lib/shared/navigation";
import { describeEmptyList } from "@/lib/list-query/list-query";
// PROTOTYPE — throwaway, do not merge (Gran final marker variants)
import {
  GranFinalBadge,
  GranFinalRowToggle,
  GranFinalSectionC,
  GranFinalSwitcher,
  useGranFinalVariant,
} from "@/features/admin/categories/gran-final-prototype";

const emptyCategoryList = describeEmptyList("categorías", "search-and-filters");

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

export const categoryFacetedFilterIds = ["tipo-de-grupo"] as const;

const categoryFacetedFilters: DataTableFacetedFiltersOf<
  typeof categoryFacetedFilterIds
> = [
  {
    id: "tipo-de-grupo",
    label: "Tipo de grupo",
    options: groupTypeOptions,
    renderValue: (option) => <Badge variant="secondary">{option.label}</Badge>,
  },
];

// PROTOTYPE — throwaway, do not merge
const granFinalColumnA: DataTableColumn<CategoryRow> = {
  id: "granFinal",
  header: "Gran final",
  cell: (category) => <GranFinalBadge category={category} />,
};

// PROTOTYPE — throwaway, do not merge
const granFinalColumnB: DataTableColumn<CategoryRow> = {
  id: "granFinal",
  header: "Gran final",
  className: "w-0",
  cell: (category) => <GranFinalRowToggle category={category} />,
};

function CategoriesListView({ loaderData }: CategoriesListViewProps) {
  const categories = loaderData.categories;
  // PROTOTYPE — throwaway, do not merge
  const variant = useGranFinalVariant();
  const columns =
    variant === "A"
      ? [...categoryColumns, granFinalColumnA]
      : variant === "B"
        ? [...categoryColumns, granFinalColumnB]
        : categoryColumns;

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
      {variant === "C" && categories.length > 0 ? (
        <GranFinalSectionC categories={categories} />
      ) : null}
      {loaderData.categories.length > 0 ? (
        <ClientDataTable
          rows={categories}
          columns={columns}
          getRowKey={(category) => category.id}
          searchPlaceholder="Buscar por nombre"
          textFilterColumnId="name"
          facetedFilters={categoryFacetedFilters}
          emptyMessage={emptyCategoryList.nothingMatched}
          initialSort={{ columnId: "ages", direction: "asc" }}
        />
      ) : (
        <AdminEmptyState
          title={emptyCategoryList.nothingYet}
          description="Creá la primera categoría para definir rangos de edad, tipos de grupo y modalidades del evento activo."
        />
      )}
      <GranFinalSwitcher />
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
