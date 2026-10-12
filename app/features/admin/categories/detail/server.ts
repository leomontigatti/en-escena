import {
  findCategoryDeleteBlockers,
  getCategory,
} from "@/lib/categories/repository.server";
import { listModalities } from "@/lib/modalities/repository.server";

import { handleCategoryAction } from "../action.server";
import { loadCategoryEventContext } from "../server";

async function loadCategoryDetail(request: Request, categoryId: string) {
  const eventContext = await loadCategoryEventContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (!selectedEventId) {
    return {
      selectedEventId,
      category: null,
      deleteBlockers: [],
      modalities: [],
    };
  }

  const [category, modalities] = await Promise.all([
    getCategory(selectedEventId, categoryId),
    listModalities(selectedEventId),
  ]);

  return {
    selectedEventId,
    category,
    deleteBlockers: category
      ? await findCategoryDeleteBlockers(category.id)
      : [],
    modalities,
  };
}

async function updateCategory(request: Request, categoryId: string) {
  return handleCategoryAction(request, {
    allowedIntents: ["update-category", "delete-category"],
    recordId: categoryId,
  });
}

export { loadCategoryDetail, updateCategory };
