import {
  EventPriceDetailRouteView,
  getPriceDisplayName,
} from "@/components/admin/events/event-prices";
import type { PriceListItem } from "@/lib/events/bases.server";

import type {
  AdministrativeEventPriceActionData,
  AdministrativeEventPricesLoaderData,
} from "../shared";

export type AdministrativeEventPriceDetailViewProps = {
  actionData?: AdministrativeEventPriceActionData;
  loaderData: AdministrativeEventPricesLoaderData;
  priceId: string;
};

export function AdministrativeEventPriceDetailView({
  loaderData,
  actionData,
  priceId,
}: AdministrativeEventPriceDetailViewProps) {
  return (
    <EventPriceDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      priceId={priceId}
    />
  );
}

export function getAdministrativeEventPriceDisplayName(
  price: PriceListItem | undefined,
) {
  return price ? getPriceDisplayName(price) : "Precio";
}
