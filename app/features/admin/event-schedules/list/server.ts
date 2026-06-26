import { loadAdministrativeEventBases } from "@/lib/admin/events/event-bases.server";

export async function loadAdministrativeEventSchedulesList(request: Request) {
  return loadAdministrativeEventBases(request);
}
