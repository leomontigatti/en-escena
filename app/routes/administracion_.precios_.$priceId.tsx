import { useActionData, useParams } from "react-router";

import { EventPriceDetailRouteView } from "@/components/admin/events/event-prices";
import { action, loader } from "@/lib/admin/events/bases-route.server";

import type { Route } from "./+types/administracion_.precios_.$priceId";

export { action, loader };

export default function AdminPriceDetailRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const params = useParams();

  return (
    <EventPriceDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      priceId={params.priceId ?? ""}
    />
  );
}
