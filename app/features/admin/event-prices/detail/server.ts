import {
  loadEventBasesRouteData,
  runEventBasesRouteAction,
} from "@/lib/admin/events/bases-route.server";

export async function loadAdministrativeEventPriceDetail(request: Request) {
  return loadEventBasesRouteData(request);
}

export async function updateAdministrativeEventPrice(request: Request) {
  return runEventBasesRouteAction(request);
}
