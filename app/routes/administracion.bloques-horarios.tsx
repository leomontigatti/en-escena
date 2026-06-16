import { EventScheduleBlocksRouteView } from "@/components/admin/events/event-schedule-blocks";
import { loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.bloques-horarios";

export { loader };

export const handle = {
  adminBreadcrumbs: [{ label: "Bloques horarios" }],
} satisfies AdminRouteHandle;

export default function AdminScheduleBlocksIndexRoute({
  loaderData,
}: Route.ComponentProps) {
  return <EventScheduleBlocksRouteView loaderData={loaderData} />;
}
