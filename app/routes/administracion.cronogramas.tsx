import type { AdminRouteHandle } from "@/components/admin/shell";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadEventSchedulesList } from "@/features/admin/schedules/list/server";
import {
  EventSchedulesListView,
  type EventSchedulesListViewProps,
} from "@/features/admin/schedules/list/view";

import type { Route } from "./+types/administracion.cronogramas";

export const handle = {
  adminBreadcrumbs: [{ label: "Cronogramas" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadEventSchedulesList(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: ["modalidad"],
});

export function EventSchedulesListRouteView({
  loaderData,
}: EventSchedulesListViewProps) {
  return <EventSchedulesListView loaderData={loaderData} />;
}

export default function EventSchedulesListRoute({
  loaderData,
}: EventSchedulesListViewProps) {
  return <EventSchedulesListRouteView loaderData={loaderData} />;
}
