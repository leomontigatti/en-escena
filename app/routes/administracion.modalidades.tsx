import type { AdminRouteHandle } from "@/components/admin/shell";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadEventModalitiesList } from "@/features/admin/modalities/list/server";
import {
  EventModalitiesListView,
  type EventModalitiesListViewProps,
} from "@/features/admin/modalities/list/view";

import type { Route } from "./+types/administracion.modalidades";

export const handle = {
  adminBreadcrumbs: [{ label: "Modalidades" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadEventModalitiesList(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate();

export function ModalitiesListRouteView({
  loaderData,
}: EventModalitiesListViewProps) {
  return <EventModalitiesListView loaderData={loaderData} />;
}

export default function ModalitiesListRoute({
  loaderData,
}: EventModalitiesListViewProps) {
  return <ModalitiesListRouteView loaderData={loaderData} />;
}
