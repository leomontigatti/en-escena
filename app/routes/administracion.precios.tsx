import { EventPricesRouteView } from "@/components/admin/events/event-prices";

import { loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.precios";

export { loader };

export const handle = {
  adminBreadcrumbs: [{ label: "Precios" }],
} satisfies AdminRouteHandle;

export default function AdminPricesRoute({ loaderData }: Route.ComponentProps) {
  return <EventPricesRouteView loaderData={loaderData} />;
}
