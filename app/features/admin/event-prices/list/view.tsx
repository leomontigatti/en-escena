import { EventPricesRouteView } from "@/components/admin/events/event-prices";

import type { AdministrativeEventPricesLoaderData } from "../shared";

export type AdministrativeEventPricesListViewProps = {
  loaderData: AdministrativeEventPricesLoaderData;
};

export function AdministrativeEventPricesListView({
  loaderData,
}: AdministrativeEventPricesListViewProps) {
  return <EventPricesRouteView loaderData={loaderData} />;
}
