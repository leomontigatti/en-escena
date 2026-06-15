import { useActionData } from "react-router";

import { NewEventPriceRouteView } from "@/components/admin/events/event-prices";
import { action, loader } from "@/lib/admin/events/bases-route.server";

import type { Route } from "./+types/administracion_.precios_.nuevo";

export { action, loader };

export default function AdminNewPriceRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewEventPriceRouteView loaderData={loaderData} actionData={actionData} />
  );
}
