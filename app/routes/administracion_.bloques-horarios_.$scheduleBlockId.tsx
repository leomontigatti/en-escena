import { useActionData, useParams } from "react-router";

import { EventScheduleBlockDetailRouteView } from "@/components/admin/events/event-schedule-blocks";
import { action, loader } from "@/lib/admin/events/bases-route.server";

import type { Route } from "./+types/administracion_.bloques-horarios_.$scheduleBlockId";

export { action, loader };

export default function AdminScheduleBlockDetailRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const params = useParams();

  return (
    <EventScheduleBlockDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      scheduleBlockId={params.scheduleBlockId ?? ""}
    />
  );
}
