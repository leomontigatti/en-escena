import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadAdminEventPricesList,
  updateAdministrativeEventPricesList,
} from "@/features/admin/prices/list/server";
import {
  EventPricesListView,
  type EventPricesListViewProps,
} from "@/features/admin/prices/list/view";

import type { Route } from "./+types/administracion.precios";

export const handle = {
  adminBreadcrumbs: [{ label: "Precios" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdminEventPricesList(request);
}

export async function action({ request }: Route.ActionArgs) {
  return updateAdministrativeEventPricesList(request);
}

export function PricesListRouteView({
  loaderData,
  actionData,
}: EventPricesListViewProps) {
  return (
    <EventPricesListView loaderData={loaderData} actionData={actionData} />
  );
}

export default function PricesListRoute({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PricesListRouteView loaderData={loaderData} actionData={actionData} />
  );
}
