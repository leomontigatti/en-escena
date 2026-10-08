import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { finalistPicks, modalities } from "@/db/schema";
import { grandFinalEligibility } from "@/lib/grand-final/eligibility.server";
import {
  readEventJudges,
  type GrandFinalJudge,
} from "@/lib/grand-final/event-judges.server";
import { readAcademyNames } from "@/lib/grand-final/finalist-pick.server";

/**
 * What administration's `Gran final` list reads: every modality of the event,
 * the academies eligible in it with the judges who picked each, and which of
 * them are `finalist`s. Everything is derived on read from the picks and from
 * `grandFinalEligibility`; nothing here is stored.
 */

export type { GrandFinalJudge };

export type GrandFinalAcademyRow = {
  academyId: string;
  /**
   * False only for an academy that is listed because a judge picked it and
   * has stopped being eligible since: the pick stays until it is changed.
   */
  eligible: boolean;
  /** Picked by some judge in any modality, unweighted (`finalist`). */
  finalist: boolean;
  name: string;
  /** The judges whose pick in this modality is this academy, by name. */
  pickedByJudgeIds: string[];
};

export type GrandFinalModalityRow = {
  academies: GrandFinalAcademyRow[];
  modalityId: string;
  modalityName: string;
};

export type GrandFinalPicks = {
  judges: GrandFinalJudge[];
  modalities: GrandFinalModalityRow[];
};

export async function readGrandFinalPicks(
  eventId: string,
): Promise<GrandFinalPicks> {
  const [eventModalities, eligible, picks, judges] = await Promise.all([
    db
      .select({ id: modalities.id, name: modalities.name })
      .from(modalities)
      .where(eq(modalities.eventId, eventId))
      .orderBy(asc(modalities.name)),
    grandFinalEligibility(eventId),
    db
      .select({
        academyId: finalistPicks.academyId,
        judgeId: finalistPicks.judgeId,
        modalityId: finalistPicks.modalityId,
      })
      .from(finalistPicks)
      .where(eq(finalistPicks.eventId, eventId)),
    readEventJudges(eventId),
  ]);
  const names = await readAcademyNames([
    ...eligible.map((pair) => pair.academyId),
    ...picks.map((pick) => pick.academyId),
  ]);
  const finalistIds = new Set(picks.map((pick) => pick.academyId));
  const judgeOrder = judges.map((judge) => judge.id);

  return {
    judges,
    modalities: eventModalities.map((modality) => {
      const eligibleIds = eligible
        .filter((pair) => pair.modalityId === modality.id)
        .map((pair) => pair.academyId);
      const modalityPicks = picks.filter(
        (pick) => pick.modalityId === modality.id,
      );
      const academyIds = new Set([
        ...eligibleIds,
        ...modalityPicks.map((pick) => pick.academyId),
      ]);

      return {
        academies: [...academyIds]
          .map((academyId) => ({
            academyId,
            eligible: eligibleIds.includes(academyId),
            finalist: finalistIds.has(academyId),
            name: names.get(academyId) ?? "",
            pickedByJudgeIds: modalityPicks
              .filter((pick) => pick.academyId === academyId)
              .map((pick) => pick.judgeId)
              .sort(
                (left, right) =>
                  judgeOrder.indexOf(left) - judgeOrder.indexOf(right),
              ),
          }))
          .sort((left, right) => left.name.localeCompare(right.name, "es")),
        modalityId: modality.id,
        modalityName: modality.name,
      };
    }),
  };
}
