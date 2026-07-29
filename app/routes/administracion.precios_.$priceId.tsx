import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  getEventPriceDisplayName,
  EventPriceDetailView,
  type EventPriceDetailViewProps,
} from "@/features/admin/prices/detail/view";
import {
  loadEventPriceDetail,
  updateAdministrativeEventPrice,
} from "@/features/admin/prices/detail/server";
import type { EventPricesLoaderData } from "@/features/admin/prices/shared";

import type { Route } from "./+types/administracion.precios_.$priceId";

type LoaderData = EventPricesLoaderData;

export const handle = {
  adminBreadcrumbs: [
    { label: "Precios", to: "/administracion/precios" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const price = data?.prices.find(
        (item) => item.id === match.params.priceId,
      );
      return { label: getEventPriceDisplayName(price) };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadEventPriceDetail(request);
}

export async function action({ request }: Route.ActionArgs) {
  return updateAdministrativeEventPrice(request);
}

export function PriceDetailRouteView({
  loaderData,
  actionData,
  priceId,
}: EventPriceDetailViewProps) {
  return (
    <EventPriceDetailView
      loaderData={loaderData}
      actionData={actionData}
      priceId={priceId}
    />
  );
}

export default function PriceDetailRoute({
  loaderData,
  params,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PriceDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      priceId={params.priceId ?? ""}
    />
  );
}
