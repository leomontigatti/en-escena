import { EventScheduleDetailRouteView } from "../route-views";
import type {
  AdministrativeEventScheduleActionData,
  AdministrativeEventScheduleDetailLoaderData,
} from "../shared";

export type AdministrativeEventScheduleDetailViewProps = {
  actionData?: AdministrativeEventScheduleActionData;
  loaderData: AdministrativeEventScheduleDetailLoaderData;
  scheduleId: string;
};

export function AdministrativeEventScheduleDetailView({
  loaderData,
  actionData,
  scheduleId,
}: AdministrativeEventScheduleDetailViewProps) {
  return (
    <EventScheduleDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      scheduleId={scheduleId}
    />
  );
}
