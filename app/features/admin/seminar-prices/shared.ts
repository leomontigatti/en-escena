import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type { SeminarPriceListItem } from "@/lib/seminar-prices/repository.server";

export type SeminarPriceActionData = ActionData;

export type SeminarPricesListLoaderData = {
  selectedEventId: string | null;
  seminarPrices: SeminarPriceListItem[];
};

const seminarPricesBasePath = "/administracion/precios/seminarios";

/**
 * The seminar list is a tab of `Precios`, not a route of its own: the search
 * param is what `Nuevo precio`, the breadcrumb and the delete redirect use to
 * name the tab the user was on.
 */
const seminarPricesTabParam = "lista";
const seminarPricesTabValue = "seminarios";
const seminarPricesListPath = `/administracion/precios?${seminarPricesTabParam}=${seminarPricesTabValue}`;

export {
  seminarPricesBasePath,
  seminarPricesListPath,
  seminarPricesTabParam,
  seminarPricesTabValue,
};
