import { EventPricesRouteView } from "@/components/admin/events/event-prices";

import { loader } from "@/lib/admin/events/bases-route.server";

import type { Route } from "./+types/administracion_.precios";

export { loader };

export default function AdminPricesRoute({ loaderData }: Route.ComponentProps) {
  return <EventPricesRouteView loaderData={loaderData} />;
}
