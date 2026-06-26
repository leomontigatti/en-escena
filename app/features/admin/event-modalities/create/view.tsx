import { NewEventModalityRouteView } from "@/components/admin/events/event-modalities";

import type {
  AdministrativeEventModalitiesLoaderData,
  AdministrativeEventModalityActionData,
} from "../shared";

export type AdministrativeEventModalityCreateViewProps = {
  loaderData: AdministrativeEventModalitiesLoaderData;
  actionData?: AdministrativeEventModalityActionData;
};

export function AdministrativeEventModalityCreateView({
  loaderData,
  actionData,
}: AdministrativeEventModalityCreateViewProps) {
  return (
    <NewEventModalityRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
