import { handleAdminEventPriceAction } from "../action.server";
import { loadAdminEventPriceFormOptions } from "../server";

export async function loadAdminEventPriceCreate(request: Request) {
  return loadAdminEventPriceFormOptions(request);
}

export async function createAdministrativeEventPrice(request: Request) {
  return handleAdminEventPriceAction(request, {
    allowedIntents: ["create-price"],
  });
}
