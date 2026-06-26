import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadAdministrativeEventDetail,
  updateAdministrativeEvent,
} from "@/features/admin/events/detail/server";
import type { AdministrativeEventDetailActionData } from "@/features/admin/events/detail/shared";
import { AdministrativeEventDetailView } from "@/features/admin/events/detail/view";
import { useActionData } from "react-router";

import type { Route } from "./+types/administracion.eventos_.$eventId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionEventoDetalleRouteProps = {
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
        | AdministracionEventoDetalleRouteProps["loaderData"]
        | undefined;
      return data ? { label: data.event.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return loadAdministrativeEventDetail(request, params.eventId);
}

export async function action({ request, params }: Route.ActionArgs) {
  return updateAdministrativeEvent(request, params.eventId);
}

export function AdministracionEventoDetalleRouteView({
  loaderData,
  actionData,
}: AdministracionEventoDetalleRouteProps) {
  return (
    <AdministrativeEventDetailView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

export default function AdministracionEventoDetalleRoute({
  loaderData,
}: AdministracionEventoDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionEventoDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
