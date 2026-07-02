import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  createCategory,
  loadCategoryCreate,
} from "@/features/admin/categories/create/server";
import {
  CategoryCreateView,
  type CategoryCreateViewProps,
} from "@/features/admin/categories/create/view";

import type { Route } from "./+types/administracion.categorias_.nueva";

export const handle = {
  adminBreadcrumbs: [
    { label: "Categorías", to: "/administracion/categorias" },
    { label: "Nueva" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadCategoryCreate(request);
}

export async function action({ request }: Route.ActionArgs) {
  return createCategory(request);
}

export function AdministracionCategoriaNuevaRouteView({
  loaderData,
  actionData,
}: CategoryCreateViewProps) {
  return <CategoryCreateView loaderData={loaderData} actionData={actionData} />;
}

export default function AdminNewCategoryRoute({
  loaderData,
}: CategoryCreateViewProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionCategoriaNuevaRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
