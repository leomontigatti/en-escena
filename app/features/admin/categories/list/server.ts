import { redirect } from "react-router";

import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { listCategories } from "@/lib/categories/repository.server";

async function loadCategoriesList(request: Request) {
  await requireAdminPanelUser(request);

  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const selectedEventId = eventContext.selectedEventId;

  return {
    selectedEventId,
    categories: selectedEventId ? await listCategories(selectedEventId) : [],
  };
}

export { loadCategoriesList };
