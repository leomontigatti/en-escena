import { useActionData, useParams } from "react-router";

import { EventScheduleDetailRouteView } from "@/components/admin/events/event-schedules";
import { action, loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.cronogramas_.$scheduleId";

export { action, loader };

type LoaderData = Route.ComponentProps["loaderData"];

export const handle = {
  adminBreadcrumbs: [
    { label: "Cronogramas", to: "/administracion/cronogramas" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const schedule = data?.schedules.find(
        (block) => block.id === match.params.scheduleId,
      );
      return { label: schedule?.name ?? "Cronograma" };
    },
  ],
} satisfies AdminRouteHandle;

export default function AdminScheduleDetailRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const params = useParams();

  return (
    <EventScheduleDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      scheduleId={params.scheduleId ?? ""}
    />
  );
}
