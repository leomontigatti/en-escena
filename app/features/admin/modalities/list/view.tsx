import { EventModalitiesRouteView } from "../route-views";

import type { AdministrativeEventModalitiesLoaderData } from "../shared";

export type AdministrativeEventModalitiesListViewProps = {
  loaderData: AdministrativeEventModalitiesLoaderData;
};

export function AdministrativeEventModalitiesListView({
  loaderData,
}: AdministrativeEventModalitiesListViewProps) {
  return <EventModalitiesRouteView loaderData={loaderData} />;
}
