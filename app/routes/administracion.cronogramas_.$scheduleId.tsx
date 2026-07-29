import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadAdminEventScheduleDetail,
  updateAdministrativeEventSchedule,
} from "@/features/admin/schedules/detail/server";
import {
  EventScheduleDetailView,
  type EventScheduleDetailViewProps,
} from "@/features/admin/schedules/detail/view";
import type { EventSchedulesLoaderData } from "@/features/admin/schedules/shared";

import type { Route } from "./+types/administracion.cronogramas_.$scheduleId";

type LoaderData = EventSchedulesLoaderData;

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

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdminEventScheduleDetail(request);
}

export async function action({ request }: Route.ActionArgs) {
  return updateAdministrativeEventSchedule(request);
}

export function EventScheduleDetailRouteView({
  loaderData,
  actionData,
  scheduleId,
}: EventScheduleDetailViewProps) {
  return (
    <EventScheduleDetailView
      loaderData={loaderData}
      actionData={actionData}
      scheduleId={scheduleId}
    />
  );
}

export default function EventScheduleDetailRoute({
  loaderData,
  params,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <EventScheduleDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      scheduleId={params.scheduleId ?? ""}
    />
  );
}
