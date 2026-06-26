import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeEventPricesList } from "@/features/admin/event-prices/list/server";
import {
  AdministrativeEventPricesListView,
  type AdministrativeEventPricesListViewProps,
} from "@/features/admin/event-prices/list/view";

import type { Route } from "./+types/administracion.precios";

export const handle = {
  adminBreadcrumbs: [{ label: "Precios" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventPricesList(request);
}

export function AdministracionPreciosRouteView({
  loaderData,
}: AdministrativeEventPricesListViewProps) {
  return <AdministrativeEventPricesListView loaderData={loaderData} />;
}

export default function AdminPricesRoute({ loaderData }: Route.ComponentProps) {
  return <AdministracionPreciosRouteView loaderData={loaderData} />;
}
