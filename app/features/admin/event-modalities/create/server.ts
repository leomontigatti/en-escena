import { handleAdministrativeEventBasesAction } from "@/lib/admin/events/event-bases.server";

export async function createAdministrativeEventModality(request: Request) {
  return handleAdministrativeEventBasesAction(request);
}
