import { EventSchedulesRouteView } from "../route-views";
import type { AdministrativeEventSchedulesListLoaderData } from "../shared";

export type AdministrativeEventSchedulesListViewProps = {
  loaderData: AdministrativeEventSchedulesListLoaderData;
};

export function AdministrativeEventSchedulesListView({
  loaderData,
}: AdministrativeEventSchedulesListViewProps) {
  return <EventSchedulesRouteView loaderData={loaderData} />;
}
