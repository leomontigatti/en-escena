import { loadAdministrativeEventBases } from "@/lib/admin/events/event-bases.server";

export async function loadAdministrativeEventPricesList(request: Request) {
  return loadAdministrativeEventBases(request);
}
