import { EventModalitiesRouteView } from "@/components/admin/events/event-modalities";

import type { AdministrativeEventModalitiesLoaderData } from "../shared";

export type AdministrativeEventModalitiesListViewProps = {
  loaderData: AdministrativeEventModalitiesLoaderData;
};

export function AdministrativeEventModalitiesListView({
  loaderData,
}: AdministrativeEventModalitiesListViewProps) {
  return <EventModalitiesRouteView loaderData={loaderData} />;
}
