import { handleSeminarDetailAction } from "../action.server";
import { loadSeminarDetailData } from "../server";

export async function loadSeminarDetail(request: Request, seminarId: string) {
  return loadSeminarDetailData(request, seminarId);
}

export async function updateAdministrativeSeminar(
  request: Request,
  seminarId: string,
) {
  return handleSeminarDetailAction(request, seminarId);
}
