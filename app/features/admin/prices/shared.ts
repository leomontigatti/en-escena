import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type {
  PriceListItem,
  ScheduleListItem,
} from "@/lib/events/bases.server";

export type AdministrativeEventPriceActionData = ActionData;

export type AdministrativeEventPricesListLoaderData = {
  selectedEventId: string | null;
  prices: PriceListItem[];
};

export type AdministrativeEventPriceFormLoaderData = {
  selectedEventId: string | null;
  schedules: ScheduleListItem[];
};

export type AdministrativeEventPriceDetailLoaderData =
  AdministrativeEventPricesListLoaderData &
    AdministrativeEventPriceFormLoaderData;

export type AdministrativeEventPricesLoaderData =
  AdministrativeEventPriceDetailLoaderData;

const basePath = "/administracion/precios";

export { basePath };
