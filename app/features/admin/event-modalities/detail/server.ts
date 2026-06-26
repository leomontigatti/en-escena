import {
  loadEventBasesRouteData,
  runEventBasesRouteAction,
} from "@/lib/admin/events/bases-route.server";

export async function loadAdministrativeEventModalityDetail(request: Request) {
  return loadEventBasesRouteData(request);
}

export async function updateAdministrativeEventModality(request: Request) {
  return runEventBasesRouteAction(request);
}
