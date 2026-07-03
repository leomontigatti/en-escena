import { listCategories } from "@/lib/categories/repository.server";
import { loadCategoryEventContext } from "../server";

async function loadCategoriesList(request: Request) {
  const eventContext = await loadCategoryEventContext(request);
  const selectedEventId = eventContext.selectedEventId;

  return {
    selectedEventId,
    categories: selectedEventId ? await listCategories(selectedEventId) : [],
  };
}

export { loadCategoriesList };
