import { EventPriceDetailRouteView, getPriceDisplayName } from "../route-views";
import type { PriceListItem } from "@/lib/events/bases.server";

import type {
  AdministrativeEventPriceActionData,
  AdministrativeEventPriceDetailLoaderData,
} from "../shared";

export type AdministrativeEventPriceDetailViewProps = {
  actionData?: AdministrativeEventPriceActionData;
  loaderData: AdministrativeEventPriceDetailLoaderData;
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
