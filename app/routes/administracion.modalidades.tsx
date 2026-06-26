import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeEventModalitiesList } from "@/features/admin/event-modalities/list/server";
import {
  AdministrativeEventModalitiesListView,
  type AdministrativeEventModalitiesListViewProps,
} from "@/features/admin/event-modalities/list/view";

import type { Route } from "./+types/administracion.modalidades";

export const handle = {
  adminBreadcrumbs: [{ label: "Modalidades" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventModalitiesList(request);
}

export function AdministracionModalidadesRouteView({
  loaderData,
}: AdministrativeEventModalitiesListViewProps) {
  return <AdministrativeEventModalitiesListView loaderData={loaderData} />;
}

export default function AdministracionModalidadesRoute({
  loaderData,
}: AdministrativeEventModalitiesListViewProps) {
  return <AdministracionModalidadesRouteView loaderData={loaderData} />;
}
