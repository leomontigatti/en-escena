import { NewEventModalityRouteView } from "../route-views";

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
