import { EventScheduleBlocksRouteView } from "@/components/admin/events/event-schedule-blocks";
import { loader } from "@/lib/admin/events/bases-route.server";

import type { Route } from "./+types/administracion_.bloques-horarios";

export { loader };

export default function AdminScheduleBlocksIndexRoute({
  loaderData,
}: Route.ComponentProps) {
  return <EventScheduleBlocksRouteView loaderData={loaderData} />;
}
