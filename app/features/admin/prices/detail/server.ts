import { handleEventPriceAction } from "../action.server";
import { loadEventPriceDetailData } from "../server";

export async function loadAdministrativeEventPriceDetail(request: Request) {
  return loadEventPriceDetailData(request);
}

export async function updateAdministrativeEventPrice(request: Request) {
  return handleEventPriceAction(request, {
    allowedIntents: ["update-price", "delete-price"],
  });
}
