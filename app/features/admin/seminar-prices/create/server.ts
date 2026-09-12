import { handleSeminarPriceAction } from "../action.server";
import { loadSeminarPricesListData } from "../server";

export async function loadSeminarPriceCreate(request: Request) {
  return loadSeminarPricesListData(request);
}

export async function createAdministrativeSeminarPrice(request: Request) {
  return handleSeminarPriceAction(request, {
    allowedIntents: ["create-seminar-price"],
  });
}
