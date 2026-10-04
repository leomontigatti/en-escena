import { handleEventScheduleAction } from "../action.server";
import { loadEventScheduleDetailData } from "../server";

export async function loadEventScheduleDetail(
  request: Request,
  scheduleId: string,
) {
  return loadEventScheduleDetailData(request, scheduleId);
}

export async function updateAdministrativeEventSchedule(request: Request) {
  return handleEventScheduleAction(request, {
    allowedIntents: [
      "update-schedule",
      "delete-schedule",
      "open-schedule-registration",
      "close-schedule-registration",
    ],
  });
}
