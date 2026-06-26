import { loadEventBasesRouteData } from "@/lib/admin/events/bases-route.server";

export async function loadAdministrativeEventCategoriesList(request: Request) {
  return loadEventBasesRouteData(request);
}
