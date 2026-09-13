import { handleSeminarPriceAction } from "../action.server";
import { loadSeminarPricesListData } from "../server";

export async function loadSeminarPriceDetail(request: Request) {
  return loadSeminarPricesListData(request);
}

export async function updateAdministrativeSeminarPrice(request: Request) {
  return handleSeminarPriceAction(request, {
    allowedIntents: ["update-seminar-price", "delete-seminar-price"],
  });
}
