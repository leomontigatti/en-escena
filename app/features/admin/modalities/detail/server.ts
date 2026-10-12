import { findModalityDeleteBlockers } from "@/lib/modalities/delete-blockers.server";

import { handleEventModalityAction } from "../action.server";
import { loadEventModalitiesData } from "../server";
import type { EventModalityDetailLoaderData } from "../shared";

export async function loadEventModalityDetail(
  request: Request,
  modalityId: string,
): Promise<EventModalityDetailLoaderData> {
  const data = await loadEventModalitiesData(request);
  const isInEvent = data.modalities.some(
    (modality) => modality.id === modalityId,
  );

  return {
    ...data,
    deleteBlockers: isInEvent
      ? await findModalityDeleteBlockers(modalityId)
      : [],
  };
}

export async function updateAdministrativeEventModality(request: Request) {
  return handleEventModalityAction(request, {
    allowedIntents: [
      "update-modality",
      "delete-modality",
      "save-submodality-criteria",
    ],
  });
}
