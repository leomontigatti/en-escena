import { handleAdministrativeEventBasesAction } from "@/lib/admin/events/event-bases.server";

export async function createAdministrativeEventSchedule(request: Request) {
  return handleAdministrativeEventBasesAction(request);
}
