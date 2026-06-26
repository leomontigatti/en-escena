import { NewEventPriceRouteView } from "@/components/admin/events/event-prices";

import type {
  AdministrativeEventPriceActionData,
  AdministrativeEventPricesLoaderData,
} from "../shared";

export type AdministrativeEventPriceCreateViewProps = {
  actionData?: AdministrativeEventPriceActionData;
  loaderData: AdministrativeEventPricesLoaderData;
};

export function AdministrativeEventPriceCreateView({
  loaderData,
  actionData,
}: AdministrativeEventPriceCreateViewProps) {
  return (
    <NewEventPriceRouteView loaderData={loaderData} actionData={actionData} />
  );
}
