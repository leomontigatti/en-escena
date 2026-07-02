import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadAdministrativeEventScheduleDetail,
  updateAdministrativeEventSchedule,
} from "@/features/admin/schedules/detail/server";
import {
  AdministrativeEventScheduleDetailView,
  type AdministrativeEventScheduleDetailViewProps,
} from "@/features/admin/schedules/detail/view";
import type { AdministrativeEventSchedulesLoaderData } from "@/features/admin/schedules/shared";

import type { Route } from "./+types/administracion.cronogramas_.$scheduleId";

type LoaderData = AdministrativeEventSchedulesLoaderData;

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
  return loadAdministrativeEventScheduleDetail(request);
}

export async function action({ request }: Route.ActionArgs) {
  return updateAdministrativeEventSchedule(request);
}

export function AdministracionCronogramaDetalleRouteView({
  loaderData,
  actionData,
  scheduleId,
}: AdministrativeEventScheduleDetailViewProps) {
  return (
    <AdministrativeEventScheduleDetailView
      loaderData={loaderData}
      actionData={actionData}
      scheduleId={scheduleId}
    />
  );
}

export default function AdministracionCronogramaDetalleRoute({
  loaderData,
  params,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionCronogramaDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
      scheduleId={params.scheduleId ?? ""}
    />
  );
}
