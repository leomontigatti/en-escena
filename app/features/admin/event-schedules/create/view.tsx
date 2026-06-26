import { NewEventScheduleRouteView } from "@/components/admin/events/event-schedules";
import type {
  AdministrativeEventScheduleActionData,
  AdministrativeEventSchedulesLoaderData,
} from "../shared";

export type AdministrativeEventScheduleCreateViewProps = {
  actionData?: AdministrativeEventScheduleActionData;
  loaderData: AdministrativeEventSchedulesLoaderData;
};

export function AdministrativeEventScheduleCreateView({
  loaderData,
  actionData,
}: AdministrativeEventScheduleCreateViewProps) {
  return (
    <NewEventScheduleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
