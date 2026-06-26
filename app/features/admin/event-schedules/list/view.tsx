import { EventSchedulesRouteView } from "@/components/admin/events/event-schedules";
import type { AdministrativeEventSchedulesLoaderData } from "../shared";

export type AdministrativeEventSchedulesListViewProps = {
  loaderData: AdministrativeEventSchedulesLoaderData;
};

export function AdministrativeEventSchedulesListView({
  loaderData,
}: AdministrativeEventSchedulesListViewProps) {
  return <EventSchedulesRouteView loaderData={loaderData} />;
}
