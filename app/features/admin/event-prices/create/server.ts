import { handleAdministrativeEventBasesAction } from "@/lib/admin/events/event-bases.server";

export async function createAdministrativeEventPrice(request: Request) {
  return handleAdministrativeEventBasesAction(request);
}
