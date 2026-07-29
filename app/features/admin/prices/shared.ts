import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type {
  PriceListItem,
  ScheduleListItem,
} from "@/lib/events/bases.server";

export type EventPriceActionData = ActionData;

export type EventPricesListLoaderData = {
  selectedEventId: string | null;
  prices: PriceListItem[];
};

export type EventPriceFormLoaderData = {
  selectedEventId: string | null;
  schedules: ScheduleListItem[];
};

export type EventPriceDetailLoaderData = EventPricesListLoaderData &
  EventPriceFormLoaderData;

export type EventPricesLoaderData = EventPriceDetailLoaderData;

const basePath = "/administracion/precios";

export { basePath };
