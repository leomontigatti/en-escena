import { useActionData } from "react-router";

import { NewEventScheduleRouteView } from "@/components/admin/events/event-schedules";
import { action, loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.cronogramas_.nuevo";

export { action, loader };

export const handle = {
  adminBreadcrumbs: [
    { label: "Cronogramas", to: "/administracion/cronogramas" },
    { label: "Nuevo cronograma" },
  ],
} satisfies AdminRouteHandle;

export default function AdminNewScheduleRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewEventScheduleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
