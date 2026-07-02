import { redirect } from "react-router";

import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  listModalities,
  listSubmodalities,
} from "@/lib/modalities/repository.server";

async function loadEventModalityContext(request: Request) {
  await requireAdminPanelUser(request);

  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  return eventContext;
}

export async function loadEventModalitiesData(request: Request) {
  const eventContext = await loadEventModalityContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (!selectedEventId) {
    return {
      selectedEventId,
      modalities: [],
      submodalities: [],
    };
  }

  const [modalities, submodalities] = await Promise.all([
    listModalities(selectedEventId),
    listSubmodalities(selectedEventId),
  ]);

  return {
    selectedEventId,
    modalities,
    submodalities,
  };
}
