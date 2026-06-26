import {
  loadAdministrativeEventBases,
  handleAdministrativeEventBasesAction,
} from "@/lib/admin/events/event-bases.server";

export async function loadAdministrativeEventModalityDetail(request: Request) {
  return loadAdministrativeEventBases(request);
}

export async function updateAdministrativeEventModality(request: Request) {
  return handleAdministrativeEventBasesAction(request);
}
