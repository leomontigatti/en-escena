import { handleCategoryAction } from "../action.server";
import { loadCategoryDetailData } from "../server";

async function loadCategoryDetail(request: Request) {
  return loadCategoryDetailData(request);
}

async function updateCategory(request: Request) {
  return handleCategoryAction(request, {
    allowedIntents: ["update-category", "delete-category"],
  });
}

export { loadCategoryDetail, updateCategory };
