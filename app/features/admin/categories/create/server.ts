import { handleCategoryAction } from "../action.server";
import { loadCategoryFormOptions } from "../server";

export async function loadCategoryCreate(request: Request) {
  return loadCategoryFormOptions(request);
}

export async function createCategory(request: Request) {
  return handleCategoryAction(request, {
    allowedIntents: ["create-category"],
  });
}
