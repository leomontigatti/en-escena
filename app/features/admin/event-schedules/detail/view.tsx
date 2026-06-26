import { EventScheduleDetailRouteView } from "@/components/admin/events/event-schedules";
import type {
  AdministrativeEventScheduleActionData,
  AdministrativeEventSchedulesLoaderData,
} from "../shared";

export type AdministrativeEventScheduleDetailViewProps = {
  actionData?: AdministrativeEventScheduleActionData;
  loaderData: AdministrativeEventSchedulesLoaderData;
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
