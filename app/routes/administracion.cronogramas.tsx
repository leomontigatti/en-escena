import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeEventSchedulesList } from "@/features/admin/schedules/list/server";
import {
  AdministrativeEventSchedulesListView,
  type AdministrativeEventSchedulesListViewProps,
} from "@/features/admin/schedules/list/view";

import type { Route } from "./+types/administracion.cronogramas";

export const handle = {
  adminBreadcrumbs: [{ label: "Cronogramas" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventSchedulesList(request);
}

export function AdministracionCronogramasRouteView({
  loaderData,
}: AdministrativeEventSchedulesListViewProps) {
  return <AdministrativeEventSchedulesListView loaderData={loaderData} />;
}

export default function AdministracionCronogramasRoute({
  loaderData,
}: AdministrativeEventSchedulesListViewProps) {
  return <AdministracionCronogramasRouteView loaderData={loaderData} />;
}
