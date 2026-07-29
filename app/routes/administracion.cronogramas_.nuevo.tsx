import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  createAdministrativeEventSchedule,
  loadAdminEventScheduleCreate,
} from "@/features/admin/schedules/create/server";
import {
  AdministrativeEventScheduleCreateView,
  type EventScheduleCreateViewProps,
} from "@/features/admin/schedules/create/view";
import type { EventScheduleActionData } from "@/features/admin/schedules/shared";

import type { Route } from "./+types/administracion.cronogramas_.nuevo";

export const handle = {
  adminBreadcrumbs: [
    { label: "Cronogramas", to: "/administracion/cronogramas" },
    { label: "Nuevo cronograma" },
  ],
} satisfies AdminRouteHandle;

type NewEventScheduleRouteProps = {
  actionData?: EventScheduleActionData;
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdminEventScheduleCreate(request);
}

export async function action({ request }: Route.ActionArgs) {
  return createAdministrativeEventSchedule(request);
}

export function NewEventScheduleRouteView({
  loaderData,
  actionData,
}: EventScheduleCreateViewProps) {
  return (
    <AdministrativeEventScheduleCreateView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

export default function NewEventScheduleRoute({
  loaderData,
}: NewEventScheduleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewEventScheduleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
