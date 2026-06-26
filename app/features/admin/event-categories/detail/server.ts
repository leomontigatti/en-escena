import {
  loadEventBasesRouteData,
  runEventBasesRouteAction,
} from "@/lib/admin/events/bases-route.server";

export async function loadAdministrativeEventCategoryDetail(request: Request) {
  return loadEventBasesRouteData(request);
}

export async function updateAdministrativeEventCategory(request: Request) {
  return runEventBasesRouteAction(request);
}
