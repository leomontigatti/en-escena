import { EventSchedulesRouteView } from "@/components/admin/events/event-schedules";
import { loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.cronogramas";

export { loader };

export const handle = {
  adminBreadcrumbs: [{ label: "Cronogramas" }],
} satisfies AdminRouteHandle;

export default function AdminSchedulesIndexRoute({
  loaderData,
}: Route.ComponentProps) {
  return <EventSchedulesRouteView loaderData={loaderData} />;
}
