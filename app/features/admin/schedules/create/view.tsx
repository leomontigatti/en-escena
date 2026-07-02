import { NewEventScheduleRouteView } from "../route-views";
import type {
  AdministrativeEventScheduleActionData,
  AdministrativeEventScheduleFormLoaderData,
} from "../shared";

export type AdministrativeEventScheduleCreateViewProps = {
  actionData?: AdministrativeEventScheduleActionData;
  loaderData: AdministrativeEventScheduleFormLoaderData;
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
