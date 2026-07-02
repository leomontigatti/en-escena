import { loadEventSchedulesListData } from "../server";

export async function loadAdministrativeEventSchedulesList(request: Request) {
  return loadEventSchedulesListData(request);
}
