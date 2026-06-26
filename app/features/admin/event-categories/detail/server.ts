import {
  loadAdministrativeEventBases,
  handleAdministrativeEventBasesAction,
} from "@/lib/admin/events/event-bases.server";

export async function loadAdministrativeEventCategoryDetail(request: Request) {
  return loadAdministrativeEventBases(request);
}

export async function updateAdministrativeEventCategory(request: Request) {
  return handleAdministrativeEventBasesAction(request);
}
