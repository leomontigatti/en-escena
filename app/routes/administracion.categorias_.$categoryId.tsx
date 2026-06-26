import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadAdministrativeEventCategoryDetail,
  updateAdministrativeEventCategory,
} from "@/features/admin/event-categories/detail/server";
import {
  AdministrativeEventCategoryDetailView,
  type AdministrativeEventCategoryDetailViewProps,
} from "@/features/admin/event-categories/detail/view";
import type { AdministrativeEventCategoriesLoaderData } from "@/features/admin/event-categories/shared";

import type { Route } from "./+types/administracion.categorias_.$categoryId";

type LoaderData = AdministrativeEventCategoriesLoaderData;

export const handle = {
  adminBreadcrumbs: [
    { label: "Categorías", to: "/administracion/categorias" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const category = data?.categories.find(
        (currentCategory) => currentCategory.id === match.params.categoryId,
      );
      return { label: category?.name ?? "Categoría" };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventCategoryDetail(request);
}

export async function action({ request }: Route.ActionArgs) {
  return updateAdministrativeEventCategory(request);
}

export function AdministracionCategoriaDetalleRouteView({
  loaderData,
  actionData,
  categoryId,
}: AdministrativeEventCategoryDetailViewProps) {
  return (
    <AdministrativeEventCategoryDetailView
      loaderData={loaderData}
      actionData={actionData}
      categoryId={categoryId}
    />
  );
}

export default function AdminCategoryDetailRoute({
  loaderData,
  params,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionCategoriaDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
      categoryId={params.categoryId ?? ""}
    />
  );
}
