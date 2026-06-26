import { loadEventBasesRouteData } from "@/lib/admin/events/bases-route.server";

export async function loadAdministrativeEventPricesList(request: Request) {
  return loadEventBasesRouteData(request);
}
