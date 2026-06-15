import { action, loader } from "@/lib/admin/events/bases-route.server";
import { EventModalitiesRouteView } from "@/components/admin/events/event-modalities";

import type { Route } from "./+types/administracion_.modalidades";

export { action, loader };

export default function AdminModalitiesRoute({
  loaderData,
}: Route.ComponentProps) {
  return <EventModalitiesRouteView loaderData={loaderData} />;
}
