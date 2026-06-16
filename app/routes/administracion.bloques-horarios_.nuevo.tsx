import { useActionData } from "react-router";

import { NewEventScheduleBlockRouteView } from "@/components/admin/events/event-schedule-blocks";
import { action, loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.bloques-horarios_.nuevo";

export { action, loader };

export const handle = {
  adminBreadcrumbs: [
    { label: "Bloques horarios", to: "/administracion/bloques-horarios" },
    { label: "Nuevo bloque horario" },
  ],
} satisfies AdminRouteHandle;

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
