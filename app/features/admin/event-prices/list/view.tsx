import type { ActionData } from "@/lib/admin/events/bases-action.server";
import { EventPricesRouteView } from "@/components/admin/events/event-prices";

import type { AdministrativeEventPricesLoaderData } from "../shared";

export type AdministrativeEventPricesListViewProps = {
  loaderData: AdministrativeEventPricesLoaderData;
  actionData?: ActionData;
};

export function AdministrativeEventPricesListView({
  loaderData,
  actionData,
}: AdministrativeEventPricesListViewProps) {
  return (
    <EventPricesRouteView loaderData={loaderData} actionData={actionData} />
  );
}
