import { loadEventBasesRouteData } from "@/lib/admin/events/bases-route.server";

export async function loadAdministrativeEventModalitiesList(request: Request) {
  return loadEventBasesRouteData(request);
}
