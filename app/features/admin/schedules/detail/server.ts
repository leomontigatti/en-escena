import { handleEventScheduleAction } from "../action.server";
import { loadEventScheduleDetailData } from "../server";

export async function loadEventScheduleDetail(request: Request) {
  return loadEventScheduleDetailData(request);
}

export async function updateAdministrativeEventSchedule(request: Request) {
  return handleEventScheduleAction(request, {
    allowedIntents: ["update-schedule", "delete-schedule"],
  });
}
