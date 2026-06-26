import { runEventBasesRouteAction } from "@/lib/admin/events/bases-route.server";

export async function createAdministrativeEventCategory(request: Request) {
  return runEventBasesRouteAction(request);
}
