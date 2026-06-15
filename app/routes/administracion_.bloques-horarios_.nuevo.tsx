import { useActionData } from "react-router";

import { NewEventScheduleBlockRouteView } from "@/components/admin/events/event-schedule-blocks";
import { action, loader } from "@/lib/admin/events/bases-route.server";

import type { Route } from "./+types/administracion_.bloques-horarios_.nuevo";

export { action, loader };

export default function AdminNewScheduleBlockRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewEventScheduleBlockRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
