import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  createAdministrativeEventSchedule,
  loadAdministrativeEventScheduleCreate,
} from "@/features/admin/schedules/create/server";
import {
  AdministrativeEventScheduleCreateView,
  type AdministrativeEventScheduleCreateViewProps,
} from "@/features/admin/schedules/create/view";
import type { AdministrativeEventScheduleActionData } from "@/features/admin/schedules/shared";

import type { Route } from "./+types/administracion.cronogramas_.nuevo";

export const handle = {
  adminBreadcrumbs: [
    { label: "Cronogramas", to: "/administracion/cronogramas" },
    { label: "Nuevo cronograma" },
  ],
} satisfies AdminRouteHandle;

type AdministracionCronogramaNuevoRouteProps = {
  actionData?: AdministrativeEventScheduleActionData;
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventScheduleCreate(request);
}

export async function action({ request }: Route.ActionArgs) {
  return createAdministrativeEventSchedule(request);
}

export function AdministracionCronogramaNuevoRouteView({
  loaderData,
  actionData,
}: AdministrativeEventScheduleCreateViewProps) {
  return (
    <AdministrativeEventScheduleCreateView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

export default function AdministracionCronogramaNuevoRoute({
  loaderData,
}: AdministracionCronogramaNuevoRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionCronogramaNuevoRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
