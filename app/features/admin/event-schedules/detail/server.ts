import {
  loadAdministrativeEventBases,
  handleAdministrativeEventBasesAction,
} from "@/lib/admin/events/event-bases.server";

export async function loadAdministrativeEventScheduleDetail(request: Request) {
  return loadAdministrativeEventBases(request);
}

export async function updateAdministrativeEventSchedule(request: Request) {
  return handleAdministrativeEventBasesAction(request);
}
