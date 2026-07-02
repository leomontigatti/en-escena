import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import { EventPricesRouteView } from "../route-views";

import type { AdministrativeEventPricesListLoaderData } from "../shared";

export type AdministrativeEventPricesListViewProps = {
  loaderData: AdministrativeEventPricesListLoaderData;
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
