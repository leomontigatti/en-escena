import { EventCategoriesRouteView } from "@/components/admin/events/event-categories";

import type { AdministrativeEventCategoriesLoaderData } from "../shared";

export type AdministrativeEventCategoriesListViewProps = {
  loaderData: AdministrativeEventCategoriesLoaderData;
};

export function AdministrativeEventCategoriesListView({
  loaderData,
}: AdministrativeEventCategoriesListViewProps) {
  return <EventCategoriesRouteView loaderData={loaderData} />;
}
