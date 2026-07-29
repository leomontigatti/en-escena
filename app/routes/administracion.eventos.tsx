import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminEvents } from "@/features/admin/events/list/server";
import {
  EventsListView,
  type EventsListViewProps,
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

export function EventsListRouteView({ loaderData }: EventsListViewProps) {
  return <EventsListView loaderData={loaderData} />;
}

export default function EventsListRoute({ loaderData }: EventsListViewProps) {
  return <EventsListRouteView loaderData={loaderData} />;
}
