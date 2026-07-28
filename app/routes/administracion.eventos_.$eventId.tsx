import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadAdminEventDetail,
  updateAdministrativeEvent,
} from "@/features/admin/events/detail/server";
import type { AdministrativeEventDetailActionData } from "@/features/admin/events/detail/shared";
import { AdministrativeEventDetailView } from "@/features/admin/events/detail/view";
import { useActionData } from "react-router";

import type { Route } from "./+types/administracion.eventos_.$eventId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type EventDetailRouteProps = {
  loaderData: LoaderData;
  actionData?: AdministrativeEventDetailActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Editar evento | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Eventos", to: "/administracion/eventos" },
    (match) => {
      const data = match.data as
        | EventDetailRouteProps["loaderData"]
        | undefined;
      return data ? { label: data.event.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return loadAdminEventDetail(request, params.eventId);
}

export async function action({ request, params }: Route.ActionArgs) {
  return updateAdministrativeEvent(request, params.eventId);
}

export function EventDetailRouteView({
  loaderData,
  actionData,
}: EventDetailRouteProps) {
  return (
    <AdministrativeEventDetailView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

export default function EventDetailRoute({
  loaderData,
}: EventDetailRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <EventDetailRouteView loaderData={loaderData} actionData={actionData} />
  );
}
