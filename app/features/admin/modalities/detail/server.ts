import { handleEventModalityAction } from "../action.server";
import { loadEventModalitiesData } from "../server";

export async function loadAdministrativeEventModalityDetail(request: Request) {
  return loadEventModalitiesData(request);
}

export async function updateAdministrativeEventModality(request: Request) {
  return handleEventModalityAction(request, {
    allowedIntents: ["update-modality", "delete-modality"],
  });
}
