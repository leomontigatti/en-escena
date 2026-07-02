import { NewEventPriceRouteView } from "../route-views";

import type {
  AdministrativeEventPriceActionData,
  AdministrativeEventPriceFormLoaderData,
} from "../shared";

export type AdministrativeEventPriceCreateViewProps = {
  actionData?: AdministrativeEventPriceActionData;
  loaderData: AdministrativeEventPriceFormLoaderData;
};

export function AdministrativeEventPriceCreateView({
  loaderData,
  actionData,
}: AdministrativeEventPriceCreateViewProps) {
  return (
    <NewEventPriceRouteView loaderData={loaderData} actionData={actionData} />
  );
}
