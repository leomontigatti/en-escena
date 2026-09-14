import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type {
  PriceListItem,
  ScheduleListItem,
} from "@/lib/events/bases.server";
import type { SeminarPriceListItem } from "@/lib/seminar-prices/repository.server";

export type EventPriceActionData = ActionData;

export type EventPricesListLoaderData = {
  selectedEventId: string | null;
  prices: PriceListItem[];
  // The `Seminarios` tab of this same screen: one list, two tabs, one loader.
  seminarPrices: SeminarPriceListItem[];
};

export type EventPriceFormLoaderData = {
  selectedEventId: string | null;
  schedules: ScheduleListItem[];
};

// The detail reads the choreography prices and the schedules, never the
// seminar list: that one belongs to the `Seminarios` tab alone.
export type EventPriceDetailLoaderData = {
  selectedEventId: string | null;
  prices: PriceListItem[];
} & EventPriceFormLoaderData;

// Everything the `Precios` routes can carry: the detail's data plus the list's
// two tabs. The tests render one view with one object; each route loads its own
// slice of it.
export type EventPricesLoaderData = EventPriceDetailLoaderData &
  EventPricesListLoaderData;

const basePath = "/administracion/precios";

export { basePath };
