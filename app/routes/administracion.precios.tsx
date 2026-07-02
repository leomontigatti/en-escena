import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadAdministrativeEventPricesList,
  updateAdministrativeEventPricesList,
} from "@/features/admin/prices/list/server";
import {
  AdministrativeEventPricesListView,
  type AdministrativeEventPricesListViewProps,
} from "@/features/admin/prices/list/view";

import type { Route } from "./+types/administracion.precios";

export const handle = {
  adminBreadcrumbs: [{ label: "Precios" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventPricesList(request);
}

export async function action({ request }: Route.ActionArgs) {
  return updateAdministrativeEventPricesList(request);
}

export function AdministracionPreciosRouteView({
  loaderData,
  actionData,
}: AdministrativeEventPricesListViewProps) {
  return (
    <AdministrativeEventPricesListView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

export default function AdminPricesRoute({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionPreciosRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
