import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminEventModalitiesList } from "@/features/admin/modalities/list/server";
import {
  AdministrativeEventModalitiesListView,
  type AdministrativeEventModalitiesListViewProps,
} from "@/features/admin/modalities/list/view";

import type { Route } from "./+types/administracion.modalidades";

export const handle = {
  adminBreadcrumbs: [{ label: "Modalidades" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdminEventModalitiesList(request);
}

export function ModalitiesListRouteView({
  loaderData,
}: AdministrativeEventModalitiesListViewProps) {
  return <AdministrativeEventModalitiesListView loaderData={loaderData} />;
}

export default function AdministracionModalidadesRoute({
  loaderData,
}: AdministrativeEventModalitiesListViewProps) {
  return <ModalitiesListRouteView loaderData={loaderData} />;
}
