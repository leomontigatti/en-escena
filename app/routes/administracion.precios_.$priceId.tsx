import { useActionData, useParams } from "react-router";

import { EventPriceDetailRouteView } from "@/components/admin/events/event-prices";
import { action, loader } from "@/lib/admin/events/bases-route.server";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.precios_.$priceId";

export { action, loader };

type LoaderData = Route.ComponentProps["loaderData"];

export const handle = {
  adminBreadcrumbs: [
    { label: "Precios", to: "/administracion/precios" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const price = data?.prices.find(
        (item) => item.id === match.params.priceId,
      );
      return { label: price?.name ?? "Precio" };
    },
  ],
} satisfies AdminRouteHandle;

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
