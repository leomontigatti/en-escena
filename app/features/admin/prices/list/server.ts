import { handleAdminEventPriceAction } from "../action.server";
import { loadAdminEventPricesListData } from "../server";

export async function loadAdminEventPricesList(request: Request) {
  return loadAdminEventPricesListData(request);
}

export async function updateAdministrativeEventPricesList(request: Request) {
  return handleAdminEventPriceAction(request, {
    allowedIntents: ["delete-price"],
  });
}
