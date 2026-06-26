import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeEventCategoriesList } from "@/features/admin/event-categories/list/server";
import {
  AdministrativeEventCategoriesListView,
  type AdministrativeEventCategoriesListViewProps,
} from "@/features/admin/event-categories/list/view";

import type { Route } from "./+types/administracion.categorias";

export const handle = {
  adminBreadcrumbs: [{ label: "Categorías" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventCategoriesList(request);
}

export function AdministracionCategoriasRouteView({
  loaderData,
}: AdministrativeEventCategoriesListViewProps) {
  return <AdministrativeEventCategoriesListView loaderData={loaderData} />;
}

export default function AdminCategoriesRoute({
  loaderData,
}: AdministrativeEventCategoriesListViewProps) {
  return <AdministracionCategoriasRouteView loaderData={loaderData} />;
}
