import { handleAdminCategoryAction } from "../action.server";
import { loadCategoryFormOptions } from "../server";

export async function loadAdminCategoryCreate(request: Request) {
  return loadCategoryFormOptions(request);
}

export async function createCategory(request: Request) {
  return handleAdminCategoryAction(request, {
    allowedIntents: ["create-category"],
  });
}
