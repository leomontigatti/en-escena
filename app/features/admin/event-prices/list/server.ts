import {
  handleAdministrativeEventBasesAction,
  loadAdministrativeEventBases,
} from "@/lib/admin/events/event-bases.server";

export async function loadAdministrativeEventPricesList(request: Request) {
  return loadAdministrativeEventBases(request);
}

export async function updateAdministrativeEventPricesList(request: Request) {
  return handleAdministrativeEventBasesAction(request);
}
