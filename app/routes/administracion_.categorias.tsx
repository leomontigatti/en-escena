import { EventCategoriesRouteView } from "@/components/admin/events/event-categories";

import { action, loader } from "@/lib/admin/events/bases-route.server";

import type { Route } from "./+types/administracion_.categorias";

export { action, loader };

export default function AdminCategoriesRoute({
  loaderData,
}: Route.ComponentProps) {
  return <EventCategoriesRouteView loaderData={loaderData} />;
}
