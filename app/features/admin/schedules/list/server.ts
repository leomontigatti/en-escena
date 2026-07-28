import { loadAdminEventSchedulesListData } from "../server";

export async function loadAdminEventSchedulesList(request: Request) {
  return loadAdminEventSchedulesListData(request);
}
