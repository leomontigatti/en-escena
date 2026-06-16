import { action, loader } from "@/lib/admin/events/bases-route.server";
import { EventModalitiesRouteView } from "@/components/admin/events/event-modalities";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.modalidades";

export { action, loader };

export const handle = {
  adminBreadcrumbs: [{ label: "Modalidades" }],
} satisfies AdminRouteHandle;

export default function AdminModalitiesRoute({
  loaderData,
}: Route.ComponentProps) {
  return <EventModalitiesRouteView loaderData={loaderData} />;
}
