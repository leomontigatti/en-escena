import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import { createAdministrativeEventCategory } from "@/features/admin/event-categories/create/server";
import {
  AdministrativeEventCategoryCreateView,
  type AdministrativeEventCategoryCreateViewProps,
} from "@/features/admin/event-categories/create/view";
import { loadAdministrativeEventCategoriesList } from "@/features/admin/event-categories/list/server";

import type { Route } from "./+types/administracion.categorias_.nueva";

export const handle = {
  adminBreadcrumbs: [
    { label: "Categorías", to: "/administracion/categorias" },
    { label: "Nueva" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventCategoriesList(request);
}

export async function action({ request }: Route.ActionArgs) {
  return createAdministrativeEventCategory(request);
}

export function AdministracionCategoriaNuevaRouteView({
  loaderData,
  actionData,
}: AdministrativeEventCategoryCreateViewProps) {
  return (
    <AdministrativeEventCategoryCreateView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

export default function AdminNewCategoryRoute({
  loaderData,
}: AdministrativeEventCategoryCreateViewProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionCategoriaNuevaRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
