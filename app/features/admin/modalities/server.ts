import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  findScoreLockedSubmodalityIds,
  listSubmodalityCriteria,
} from "@/lib/judging/criteria.server";
import {
  listModalities,
  listSubmodalities,
} from "@/lib/modalities/repository.server";

async function loadEventModalityContext(request: Request) {
  await requireAdminPanelUser(request);

  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  return eventContext;
}

async function loadEventModalitiesData(request: Request) {
  const eventContext = await loadEventModalityContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (!selectedEventId) {
    return {
      selectedEventId,
      modalities: [],
      submodalities: [],
      submodalityCriteria: [],
      lockedSubmodalityIds: [],
    };
  }

  const [modalities, submodalities, submodalityCriteria, lockedSubmodalityIds] =
    await Promise.all([
      listModalities(selectedEventId),
      listSubmodalities(selectedEventId),
      listSubmodalityCriteria(selectedEventId),
      findScoreLockedSubmodalityIds(selectedEventId),
    ]);

  return {
    selectedEventId,
    modalities,
    submodalities,
    submodalityCriteria,
    lockedSubmodalityIds: [...lockedSubmodalityIds],
  };
}

export { loadEventModalitiesData };
