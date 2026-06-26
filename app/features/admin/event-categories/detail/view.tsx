import { EventCategoryDetailRouteView } from "@/components/admin/events/event-categories";

import type {
  AdministrativeEventCategoriesLoaderData,
  AdministrativeEventCategoryActionData,
} from "../shared";

export type AdministrativeEventCategoryDetailViewProps = {
  loaderData: AdministrativeEventCategoriesLoaderData;
  actionData?: AdministrativeEventCategoryActionData;
  categoryId: string;
};

export function AdministrativeEventCategoryDetailView({
  loaderData,
  actionData,
  categoryId,
}: AdministrativeEventCategoryDetailViewProps) {
  return (
    <EventCategoryDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      categoryId={categoryId}
    />
  );
}
