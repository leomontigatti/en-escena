import { useActionData } from "react-router";

import { NewEventPriceRouteView } from "@/components/admin/events/event-prices";
import { action, loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.precios_.nuevo";

export { action, loader };

export const handle = {
  adminBreadcrumbs: [
    { label: "Precios", to: "/administracion/precios" },
    { label: "Nuevo precio" },
  ],
} satisfies AdminRouteHandle;

export default function AdminNewPriceRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewEventPriceRouteView loaderData={loaderData} actionData={actionData} />
  );
}
