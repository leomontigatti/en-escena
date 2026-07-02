import { handleEventPriceAction } from "../action.server";
import { loadEventPricesListData } from "../server";

export async function loadAdministrativeEventPricesList(request: Request) {
  return loadEventPricesListData(request);
}

export async function updateAdministrativeEventPricesList(request: Request) {
  return handleEventPriceAction(request, {
    allowedIntents: ["delete-price"],
  });
}
