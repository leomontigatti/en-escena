import { loadEventModalitiesData } from "../server";

export async function loadEventModalitiesList(request: Request) {
  return loadEventModalitiesData(request);
}
