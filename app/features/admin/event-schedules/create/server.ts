import { runEventBasesRouteAction } from "@/lib/admin/events/bases-route.server";

export async function createAdministrativeEventSchedule(request: Request) {
  return runEventBasesRouteAction(request);
}
