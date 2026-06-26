import { runEventBasesRouteAction } from "@/lib/admin/events/bases-route.server";

export async function createAdministrativeEventModality(request: Request) {
  return runEventBasesRouteAction(request);
}
