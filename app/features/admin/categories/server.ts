import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { listModalities } from "@/lib/modalities/repository.server";

async function loadCategoryEventContext(request: Request) {
  await requireAdminPanelWriter(request);

  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  return eventContext;
}

async function loadCategoryFormOptions(request: Request) {
  const eventContext = await loadCategoryEventContext(request);
  const selectedEventId = eventContext.selectedEventId;

  return {
    selectedEventId,
    modalities: selectedEventId ? await listModalities(selectedEventId) : [],
  };
}

export { loadCategoryEventContext, loadCategoryFormOptions };
