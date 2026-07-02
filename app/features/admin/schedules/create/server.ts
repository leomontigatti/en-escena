import { handleEventScheduleAction } from "../action.server";
import { loadEventScheduleFormOptions } from "../server";

export async function loadAdministrativeEventScheduleCreate(request: Request) {
  return loadEventScheduleFormOptions(request);
}

export async function createAdministrativeEventSchedule(request: Request) {
  return handleEventScheduleAction(request, {
    allowedIntents: ["create-schedule"],
  });
}
