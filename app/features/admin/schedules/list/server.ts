import { loadEventSchedulesListData } from "../server";

export async function loadAdminEventSchedulesList(request: Request) {
  return loadEventSchedulesListData(request);
}
