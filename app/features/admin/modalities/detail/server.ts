import { handleAdminEventModalityAction } from "../action.server";
import { loadEventModalitiesData } from "../server";

export async function loadAdminEventModalityDetail(request: Request) {
  return loadEventModalitiesData(request);
}

export async function updateAdministrativeEventModality(request: Request) {
  return handleAdminEventModalityAction(request, {
    allowedIntents: ["update-modality", "delete-modality"],
  });
}
