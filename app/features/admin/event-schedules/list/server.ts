import { loadEventBasesRouteData } from "@/lib/admin/events/bases-route.server";

export async function loadAdministrativeEventSchedulesList(request: Request) {
  return loadEventBasesRouteData(request);
}
