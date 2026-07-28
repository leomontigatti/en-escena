import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminEvents } from "@/features/admin/events/list/server";
import {
  AdministrativeEventsListView,
  type AdministrativeEventsListViewProps,
} from "@/features/admin/events/list/view";

import type { Route } from "./+types/administracion.eventos";

export const meta: Route.MetaFunction = () => [
  { title: "Eventos | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Eventos" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdminEvents(request);
}

export function EventsListRouteView({
  loaderData,
}: AdministrativeEventsListViewProps) {
  return <AdministrativeEventsListView loaderData={loaderData} />;
}

export default function AdministracionEventosRoute({
  loaderData,
}: AdministrativeEventsListViewProps) {
  return <EventsListRouteView loaderData={loaderData} />;
}
