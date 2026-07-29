import { loadEventSchedulesListData } from "../server";

export async function loadEventSchedulesList(request: Request) {
  return loadEventSchedulesListData(request);
}
