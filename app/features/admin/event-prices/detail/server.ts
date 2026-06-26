import {
  loadAdministrativeEventBases,
  handleAdministrativeEventBasesAction,
} from "@/lib/admin/events/event-bases.server";

export async function loadAdministrativeEventPriceDetail(request: Request) {
  return loadAdministrativeEventBases(request);
}

export async function updateAdministrativeEventPrice(request: Request) {
  return handleAdministrativeEventBasesAction(request);
}
