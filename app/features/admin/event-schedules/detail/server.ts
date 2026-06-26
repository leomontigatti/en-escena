import {
  loadEventBasesRouteData,
  runEventBasesRouteAction,
} from "@/lib/admin/events/bases-route.server";

export async function loadAdministrativeEventScheduleDetail(request: Request) {
  return loadEventBasesRouteData(request);
}

export async function updateAdministrativeEventSchedule(request: Request) {
  return runEventBasesRouteAction(request);
}
