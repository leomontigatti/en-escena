import type { AdminRouteHandle } from "@/components/admin/shell";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadCategoriesList } from "@/features/admin/categories/list/server";
import {
  CategoriesListView,
  type CategoriesListViewProps,
  categoryFacetedFilterIds,
} from "@/features/admin/categories/list/view";

import type { Route } from "./+types/administracion.categorias";

const handle = {
  adminBreadcrumbs: [{ label: "Categorías" }],
} satisfies AdminRouteHandle;

async function loader({ request }: Route.LoaderArgs) {
  return loadCategoriesList(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...categoryFacetedFilterIds],
});

export function CategoriesRouteView({ loaderData }: CategoriesListViewProps) {
  return <CategoriesListView loaderData={loaderData} />;
}

export default CategoriesRouteView;

export { handle, loader };
