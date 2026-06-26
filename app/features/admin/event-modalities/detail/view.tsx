import { EventModalityDetailRouteView } from "@/components/admin/events/event-modalities";

import type {
  AdministrativeEventModalitiesLoaderData,
  AdministrativeEventModalityActionData,
} from "../shared";

export type AdministrativeEventModalityDetailViewProps = {
  loaderData: AdministrativeEventModalitiesLoaderData;
  actionData?: AdministrativeEventModalityActionData;
  modalityId: string;
};

export function AdministrativeEventModalityDetailView({
  loaderData,
  actionData,
  modalityId,
}: AdministrativeEventModalityDetailViewProps) {
  return (
    <EventModalityDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      modalityId={modalityId}
    />
  );
}
