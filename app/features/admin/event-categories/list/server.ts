import { loadAdministrativeEventBases } from "@/lib/admin/events/event-bases.server";

export async function loadAdministrativeEventCategoriesList(request: Request) {
  return loadAdministrativeEventBases(request);
}
