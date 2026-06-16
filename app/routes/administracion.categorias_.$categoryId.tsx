import { useActionData } from "react-router";

import { EventCategoryDetailRouteView } from "@/components/admin/events/event-categories";

import { action, loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.categorias_.$categoryId";

export { action, loader };

type LoaderData = Route.ComponentProps["loaderData"];

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

export default function AdminCategoryDetailRoute({
  loaderData,
  params,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <EventCategoryDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      categoryId={params.categoryId ?? ""}
    />
  );
}
