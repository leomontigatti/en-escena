import { loadAdministrativeEventBases } from "@/lib/admin/events/event-bases.server";

export async function loadAdministrativeEventModalitiesList(request: Request) {
  return loadAdministrativeEventBases(request);
}
