import { handleAdministrativeEventBasesAction } from "@/lib/admin/events/event-bases.server";

export async function createAdministrativeEventCategory(request: Request) {
  return handleAdministrativeEventBasesAction(request);
}
