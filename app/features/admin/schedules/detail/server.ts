import { handleAdminEventScheduleAction } from "../action.server";
import { loadAdminEventScheduleDetailData } from "../server";

export async function loadAdminEventScheduleDetail(request: Request) {
  return loadAdminEventScheduleDetailData(request);
}

export async function updateAdministrativeEventSchedule(request: Request) {
  return handleAdminEventScheduleAction(request, {
    allowedIntents: ["update-schedule", "delete-schedule"],
  });
}
