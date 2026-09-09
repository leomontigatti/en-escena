import { handleSeminarCreateAction } from "../action.server";
import { loadSeminarCreateData } from "../server";

export async function loadSeminarCreate(request: Request) {
  return loadSeminarCreateData(request);
}

export async function createAdministrativeSeminar(request: Request) {
  return handleSeminarCreateAction(request);
}
