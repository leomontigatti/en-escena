import { useActionData } from "react-router";

import { NewEventCategoryRouteView } from "@/components/admin/events/event-categories";

import { action, loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.categorias_.nueva";

export { action, loader };

export const handle = {
  adminBreadcrumbs: [
    { label: "Categorías", to: "/administracion/categorias" },
    { label: "Nueva" },
  ],
} satisfies AdminRouteHandle;

export default function AdminNewCategoryRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewEventCategoryRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
