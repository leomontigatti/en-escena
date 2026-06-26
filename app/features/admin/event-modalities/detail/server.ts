import {
  loadEventBasesRouteData,
  runEventBasesRouteAction,
} from "@/lib/admin/events/bases-route.server";

export async function loadAdministrativeEventModalityDetail(
  request: Request,
  _modalityId: string | undefined,
) {
  return loadEventBasesRouteData(request);
}

export async function updateAdministrativeEventModality(
  request: Request,
  _modalityId: string | undefined,
) {
  return runEventBasesRouteAction(request);
}
