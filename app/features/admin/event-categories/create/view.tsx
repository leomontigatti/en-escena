import { NewEventCategoryRouteView } from "@/components/admin/events/event-categories";
import type {
  AdministrativeEventCategoriesLoaderData,
  AdministrativeEventCategoryActionData,
} from "@/features/admin/event-categories/shared";

export type AdministrativeEventCategoryCreateViewProps = {
  loaderData: AdministrativeEventCategoriesLoaderData;
  actionData?: AdministrativeEventCategoryActionData;
};

export function AdministrativeEventCategoryCreateView({
  loaderData,
  actionData,
}: AdministrativeEventCategoryCreateViewProps) {
  return (
    <NewEventCategoryRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
