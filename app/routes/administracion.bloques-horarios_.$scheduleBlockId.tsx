import { useActionData, useParams } from "react-router";

import { EventScheduleBlockDetailRouteView } from "@/components/admin/events/event-schedule-blocks";
import { action, loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.bloques-horarios_.$scheduleBlockId";

export { action, loader };

type LoaderData = Route.ComponentProps["loaderData"];

export const handle = {
  adminBreadcrumbs: [
    { label: "Bloques horarios", to: "/administracion/bloques-horarios" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const scheduleBlock = data?.scheduleBlocks.find(
        (block) => block.id === match.params.scheduleBlockId,
      );
      return { label: scheduleBlock?.name ?? "Bloque horario" };
    },
  ],
} satisfies AdminRouteHandle;

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
