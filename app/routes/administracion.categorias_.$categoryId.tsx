import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadCategoryDetail,
  updateCategory,
} from "@/features/admin/categories/detail/server";
import {
  CategoryDetailView,
  type CategoryDetailViewProps,
} from "@/features/admin/categories/detail/view";
import type { CategoryDetailLoaderData } from "@/features/admin/categories/shared";

import type { Route } from "./+types/administracion.categorias_.$categoryId";

type LoaderData = CategoryDetailLoaderData;

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
  return loadCategoryDetail(request);
}

export async function action({ request }: Route.ActionArgs) {
  return updateCategory(request);
}

export function AdministracionCategoriaDetalleRouteView({
  loaderData,
  actionData,
  categoryId,
}: CategoryDetailViewProps) {
  return (
    <CategoryDetailView
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
