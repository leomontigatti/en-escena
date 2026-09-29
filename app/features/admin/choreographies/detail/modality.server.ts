import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { modalities } from "@/db/schema";
import {
  resolveEventBasesCorrectableScheduleIds,
  resolveEventBasesScheduleModalityIds,
} from "@/lib/events/bases.server";
import { loadPriceDivergenceCheck } from "@/lib/finances/choreography-price-divergence-guard.server";

import type { ChoreographyDetail } from "./choreography-queries.server";
import type { ChoreographyModalityBlocker } from "./shared";

export type ChoreographyModalityOption = {
  /**
   * Whether any schedule of the event accepts this modality. `false` is a
   * structural dead end: the correction would leave the choreography with no
   * schedule, and `findChoreographyDetail` innerJoins it, so the detail view
   * would 404 out from under the administrator.
   */
  hasCompatibleScheduleCapacity: boolean;
  id: string;
  name: string;
};

/**
 * The price is reported as a blocker-in-waiting, not as a closed field: a
 * destination modality whose capacity holds the price is saved like any other.
 * It is enumerated for the `auditor` too.
 *
 * Phrased around the price and not around the schedule moving, which is what
 * keeps it from reading as a second copy of the capacity alert: the schedule
 * moving is no longer what the save refuses, the price changing is.
 */
const priceChangeBlocker: ChoreographyModalityBlocker = {
  code: "price-change",
  label:
    "Solo se puede corregir la modalidad si el cronograma no cambia de precio: hay inscripciones con dinero asignado.",
};

/**
 * Whether any correction could land on a schedule that reprices a
 * money-holding inscription — asked of every schedule some modality of the
 * event accepts, not of the ones the current modality accepts, because the
 * correction is precisely what changes which modality's schedules are in play.
 *
 * Money alone is not the question any more: a choreography whose inscriptions
 * are all frozen against general rows can be corrected into any modality
 * without a peso moving, and announcing a caveat there is announcing nothing.
 */
export async function listChoreographyModalityBlockers(input: {
  choreography: ChoreographyDetail;
  eventId: string;
}): Promise<ChoreographyModalityBlocker[]> {
  const [scheduleIds, diverges] = await Promise.all([
    resolveEventBasesCorrectableScheduleIds(input.eventId),
    loadPriceDivergenceCheck({
      choreographyId: input.choreography.id,
      executor: db,
    }),
  ]);
  const hasPriceDivergentSchedule = scheduleIds.some((scheduleId) =>
    diverges({
      // Modality is not part of the price key: the correction moves the
      // schedule alone and keeps the group type the roster gives.
      groupType: input.choreography.groupType,
      scheduleId,
    }),
  );

  return hasPriceDivergentSchedule ? [priceChangeBlocker] : [];
}

/**
 * Every modality of the event, current one included, each carrying whether a
 * schedule can take it. The options the view offers are exactly the ones the
 * intent accepts, and the ones it renders disabled are exactly the ones the
 * intent rejects.
 */
export async function listChoreographyModalityOptions(
  eventId: string,
): Promise<ChoreographyModalityOption[]> {
  const [modalityRows, scheduledModalityIds] = await Promise.all([
    db
      .select({ id: modalities.id, name: modalities.name })
      .from(modalities)
      .where(eq(modalities.eventId, eventId))
      .orderBy(asc(modalities.name)),
    resolveEventBasesScheduleModalityIds(eventId),
  ]);
  const scheduled = new Set(scheduledModalityIds);

  return modalityRows.map((modality) => ({
    hasCompatibleScheduleCapacity: scheduled.has(modality.id),
    id: modality.id,
    name: modality.name,
  }));
}
