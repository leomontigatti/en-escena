import { handleEventPriceAction } from "../action.server";
import { loadEventPriceFormOptions } from "../server";

export async function loadAdministrativeEventPriceCreate(request: Request) {
  return loadEventPriceFormOptions(request);
}

export async function createAdministrativeEventPrice(request: Request) {
  return handleEventPriceAction(request, {
    allowedIntents: ["create-price"],
  });
}
