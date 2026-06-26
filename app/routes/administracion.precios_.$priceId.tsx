import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  getAdministrativeEventPriceDisplayName,
  AdministrativeEventPriceDetailView,
  type AdministrativeEventPriceDetailViewProps,
} from "@/features/admin/event-prices/detail/view";
import {
  loadAdministrativeEventPriceDetail,
  updateAdministrativeEventPrice,
} from "@/features/admin/event-prices/detail/server";
import type { AdministrativeEventPricesLoaderData } from "@/features/admin/event-prices/shared";

import type { Route } from "./+types/administracion.precios_.$priceId";

type LoaderData = AdministrativeEventPricesLoaderData;

export const handle = {
  adminBreadcrumbs: [
    { label: "Precios", to: "/administracion/precios" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const price = data?.prices.find(
        (item) => item.id === match.params.priceId,
      );
      return { label: getAdministrativeEventPriceDisplayName(price) };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventPriceDetail(request);
}

export async function action({ request }: Route.ActionArgs) {
  return updateAdministrativeEventPrice(request);
}

export function AdministracionPrecioDetalleRouteView({
  loaderData,
  actionData,
  priceId,
}: AdministrativeEventPriceDetailViewProps) {
  return (
    <AdministrativeEventPriceDetailView
      loaderData={loaderData}
      actionData={actionData}
      priceId={priceId}
    />
  );
}

export default function AdminPriceDetailRoute({
  loaderData,
  params,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionPrecioDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
      priceId={params.priceId ?? ""}
    />
  );
}
