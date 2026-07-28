import { loadEventModalitiesData } from "../server";

export async function loadAdminEventModalitiesList(request: Request) {
  return loadEventModalitiesData(request);
}
