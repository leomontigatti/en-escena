import { and, asc, eq, notInArray } from "drizzle-orm";

import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import {
  choreographies,
  db,
  modalities,
  uniqueValues,
} from "@/lib/events/bases-repository/shared.server";

/**
 * The names of the modalities a choreography occupying the schedule has, among
 * those `modalityIds` leaves out: the modalities an edit cannot remove.
 */
export async function listExcludedOccupiedModalities(
  scheduleId: string,
  modalityIds: string[],
) {
  const excluded = await db
    .selectDistinct({ name: modalities.name })
    .from(choreographies)
    .innerJoin(modalities, eq(choreographies.modalityId, modalities.id))
    .where(
      and(
        eq(choreographies.scheduleId, scheduleId),
        notInArray(choreographies.modalityId, modalityIds),
        notWithdrawnChoreography(),
      ),
    )
    .orderBy(asc(modalities.name));

  return excluded.map((modality) => modality.name);
}

export function getScheduleModalityValues(
  scheduleId: string,
  modalityIds: string[],
) {
  return uniqueValues(modalityIds).map((modalityId) => ({
    scheduleId,
    modalityId,
  }));
}

export function groupScheduleModalities(
  acceptedModalities: Array<{
    scheduleId: string;
    modalityId: string;
    modalityName: string;
  }>,
) {
  const modalitiesByScheduleId = new Map<
    string,
    Array<Pick<typeof modalities.$inferSelect, "id" | "name">>
  >();

  for (const modality of acceptedModalities) {
    const scheduleEntries =
      modalitiesByScheduleId.get(modality.scheduleId) ?? [];

    scheduleEntries.push({
      id: modality.modalityId,
      name: modality.modalityName,
    });
    modalitiesByScheduleId.set(modality.scheduleId, scheduleEntries);
  }

  return modalitiesByScheduleId;
}
