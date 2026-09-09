import { loadSeminarsListData } from "../server";

export async function loadSeminarsList(request: Request) {
  return loadSeminarsListData(request);
}
