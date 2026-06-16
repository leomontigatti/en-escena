import { EventCategoriesRouteView } from "@/components/admin/events/event-categories";

import { action, loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.categorias";

export { action, loader };

export const handle = {
  adminBreadcrumbs: [{ label: "Categorías" }],
} satisfies AdminRouteHandle;

export default function AdminCategoriesRoute({
  loaderData,
}: Route.ComponentProps) {
  return <EventCategoriesRouteView loaderData={loaderData} />;
}
