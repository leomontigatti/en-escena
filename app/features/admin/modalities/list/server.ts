import { loadEventModalitiesData } from "../server";

export async function loadAdministrativeEventModalitiesList(request: Request) {
  return loadEventModalitiesData(request);
}
