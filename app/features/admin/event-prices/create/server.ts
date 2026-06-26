import { runEventBasesRouteAction } from "@/lib/admin/events/bases-route.server";

export async function createAdministrativeEventPrice(request: Request) {
  return runEventBasesRouteAction(request);
}
