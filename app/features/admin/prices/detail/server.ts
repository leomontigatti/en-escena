import { handleAdminEventPriceAction } from "../action.server";
import { loadAdminEventPriceDetailData } from "../server";

export async function loadAdminEventPriceDetail(request: Request) {
  return loadAdminEventPriceDetailData(request);
}

export async function updateAdministrativeEventPrice(request: Request) {
  return handleAdminEventPriceAction(request, {
    allowedIntents: ["update-price", "delete-price"],
  });
}
