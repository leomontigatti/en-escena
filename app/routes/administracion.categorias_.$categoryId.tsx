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
      return { label: data?.category?.name ?? "Categoría" };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return loadCategoryDetail(request, params.categoryId ?? "");
}

export async function action({ request, params }: Route.ActionArgs) {
  return updateCategory(request, params.categoryId ?? "");
}

export function AdministracionCategoriaDetalleRouteView({
  loaderData,
  actionData,
}: CategoryDetailViewProps) {
  return <CategoryDetailView loaderData={loaderData} actionData={actionData} />;
}

export default function AdminCategoryDetailRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionCategoriaDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
