import { handleEventModalityAction } from "../action.server";
import { loadEventModalitiesData } from "../server";

export async function loadAdminEventModalityCreate(request: Request) {
  return loadEventModalitiesData(request);
}

export async function createAdministrativeEventModality(request: Request) {
  return handleEventModalityAction(request, {
    allowedIntents: ["create-modality"],
  });
}
