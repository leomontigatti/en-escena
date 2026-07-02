import { redirect } from "react-router";

import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { listCategories } from "@/lib/categories/repository.server";
import { listModalities } from "@/lib/modalities/repository.server";

async function loadCategoryEventContext(request: Request) {
  await requireAdminPanelUser(request);

  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  return eventContext;
}

export async function loadCategoryFormOptions(request: Request) {
  const eventContext = await loadCategoryEventContext(request);
  const selectedEventId = eventContext.selectedEventId;

  return {
    selectedEventId,
    modalities: selectedEventId ? await listModalities(selectedEventId) : [],
  };
}

export async function loadCategoryDetailData(request: Request) {
  const eventContext = await loadCategoryEventContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (!selectedEventId) {
    return {
      selectedEventId,
      categories: [],
      modalities: [],
    };
  }

  const [categories, modalities] = await Promise.all([
    listCategories(selectedEventId),
    listModalities(selectedEventId),
  ]);

  return {
    selectedEventId,
    categories,
    modalities,
  };
}
