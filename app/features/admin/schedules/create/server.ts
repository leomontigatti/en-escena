import { handleAdminEventScheduleAction } from "../action.server";
import { loadAdminEventScheduleFormOptions } from "../server";

export async function loadAdminEventScheduleCreate(request: Request) {
  return loadAdminEventScheduleFormOptions(request);
}

export async function createAdministrativeEventSchedule(request: Request) {
  return handleAdminEventScheduleAction(request, {
    allowedIntents: ["create-schedule"],
  });
}
